import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import UsageDashboard from '../../components/admin/UsageDashboard';
import * as quotaService from '../../services/quotaService';
import * as classService from '../../services/classService';
import * as responseService from '../../services/responseService';

/**
 * Creating a class is admin-only — owning one is what grants sight of student
 * work, the same reasoning as set_user_role — so it belongs beside the school
 * management the admin dashboard already has. Until this panel existed there
 * was no way to create a class outside hand-written SQL, and the demo seeder's
 * own comment recorded the consequence: "a teacher with no class sees nothing".
 */

vi.mock('../../services/curriculumService', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return { ...actual, isCurriculumRemote: () => true };
});

vi.mock('../../services/classService', async (importOriginal) => {
  const actual = await importOriginal<typeof classService>();
  return { ...actual, createClass: vi.fn(), enrolInClass: vi.fn() };
});

vi.mock('../../services/responseService', async (importOriginal) => {
  const actual = await importOriginal<typeof responseService>();
  return { ...actual, fetchMyClasses: vi.fn() };
});

vi.mock('../../services/quotaService', async (importOriginal) => {
  const actual = await importOriginal<typeof quotaService>();
  return {
    ...actual,
    fetchUsageReport: vi.fn().mockResolvedValue([]),
    fetchMyQuotaStatus: vi.fn().mockResolvedValue({ used: 0, limit: 100, remaining: 100 }),
    fetchRoleQuotas: vi.fn().mockResolvedValue([]),
    fetchSchools: vi.fn(),
    setRoleQuota: vi.fn(),
    setUserQuotaOverride: vi.fn(),
  };
});

const schools = [
  { id: 's1', name: 'Northmead High', daily_ai_limit: null, members: 4, used_today: 0 },
];

const showToast = vi.fn();

const open = async () => {
  render(<UsageDashboard isOpen onClose={vi.fn()} showToast={showToast} />);
  await waitFor(() => expect(screen.getByText('Classes')).toBeTruthy());
};

beforeEach(() => {
  vi.mocked(quotaService.fetchSchools).mockResolvedValue(schools as never);
  vi.mocked(responseService.fetchMyClasses).mockResolvedValue([]);
  vi.mocked(classService.createClass).mockResolvedValue(undefined);
  vi.mocked(classService.enrolInClass).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Usage Dashboard — class record-keeping', () => {
  it('creates a class in a school and hands it to a teacher', async () => {
    await open();

    fireEvent.change(screen.getByLabelText(/school for the new class/i), {
      target: { value: 'Northmead High' },
    });
    fireEvent.change(screen.getByLabelText(/new class name/i), { target: { value: '12BIO1' } });
    fireEvent.change(screen.getByLabelText(/username of the teacher who owns the class/i), {
      target: { value: 'jsmith' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create class/i }));

    await waitFor(() =>
      expect(classService.createClass).toHaveBeenCalledWith('Northmead High', '12BIO1', 'jsmith', 12)
    );
  });

  it('refuses a class with no owning teacher rather than creating an orphan', async () => {
    await open();

    fireEvent.change(screen.getByLabelText(/school for the new class/i), {
      target: { value: 'Northmead High' },
    });
    fireEvent.change(screen.getByLabelText(/new class name/i), { target: { value: '12BIO1' } });
    fireEvent.click(screen.getByRole('button', { name: /create class/i }));

    expect(classService.createClass).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      'A class needs a school, a name and an owning teacher.',
      'error'
    );
  });

  it('explains why the analytics are empty before any class exists', async () => {
    await open();
    expect(
      screen.getByText(/until a class exists and has students in it, every class analytic is empty/i)
    ).toBeTruthy();
  });

  it('offers enrolment only once there is a class to enrol into', async () => {
    await open();
    expect(screen.queryByLabelText(/username to enrol in a class/i)).toBeNull();

    cleanup();
    vi.mocked(responseService.fetchMyClasses).mockResolvedValue([
      { id: 'cls-1', name: '12BIO1', year: 12, school: 'Northmead High', students: 0 },
    ] as never);
    await open();

    fireEvent.change(screen.getByLabelText(/username to enrol in a class/i), {
      target: { value: 'akhan' },
    });
    fireEvent.change(screen.getByLabelText(/class to enrol them in/i), {
      target: { value: 'cls-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^enrol$/i }));

    await waitFor(() =>
      expect(classService.enrolInClass).toHaveBeenCalledWith('cls-1', 'akhan', 'student')
    );
  });

  it('hides the panel entirely on a database that predates schema §19', async () => {
    vi.mocked(responseService.fetchMyClasses).mockRejectedValue(new Error('no such function'));
    render(<UsageDashboard isOpen onClose={vi.fn()} showToast={showToast} />);
    await waitFor(() => expect(screen.getByText('Calls Today')).toBeTruthy());
    // Same progressive-enhancement rule as schools: absent RPC hides the
    // section rather than claiming the deployment has no classes.
    expect(screen.queryByText('Classes')).toBeNull();
  });
});
