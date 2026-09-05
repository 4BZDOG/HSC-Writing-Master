import React, { useState } from 'react';
import { Course } from '../../types';
import {
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Layers,
  BookOpen,
  Hash,
} from 'lucide-react';
import { yearOfTopic, yearShortLabel } from '../../utils/syllabusYear';

interface TopicReorderListProps {
  courses: Course[];
  onMoveTopic: (courseId: string, topicId: string, direction: 'up' | 'down') => void;
}

const TopicReorderList = ({ courses, onMoveTopic }: TopicReorderListProps) => {
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);

  const toggleCourse = (id: string) => {
    setExpandedCourseId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6">
      {courses.map((course) => (
        <div
          key={course.id}
          className={`clip-stable rounded-panel overflow-hidden transition-all duration-500 border ${expandedCourseId === course.id ? 'bg-black/40 light:bg-indigo-50/60 border-indigo-500/30 light:border-indigo-300 shadow-lg' : 'bg-white/[0.03] light:bg-slate-50 border-white/5 light:border-slate-200'}`}
        >
          <button
            onClick={() => toggleCourse(course.id)}
            className="w-full flex items-center justify-between p-6 hover:bg-white/5 light:hover:bg-slate-100 transition-all text-left group"
          >
            <div className="flex items-center gap-6">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 border ${expandedCourseId === course.id ? 'bg-indigo-600 text-white border-white/20' : 'bg-white/5 light:bg-slate-100 text-slate-500 group-hover:text-slate-300 light:group-hover:text-slate-700 border-white/5 light:border-slate-200'}`}
              >
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <span
                  className={`text-lg font-black tracking-tight italic leading-none block mb-1 ${expandedCourseId === course.id ? 'text-white light:text-slate-900' : 'text-slate-400 light:text-slate-600 group-hover:text-white light:group-hover:text-slate-900'}`}
                >
                  {course.name}
                </span>
                <div className="flex items-center gap-3">
                  <span className="t-label text-slate-500 light:text-slate-500">
                    {course.topics.length} {course.topics.length === 1 ? 'Topic' : 'Topics'}
                  </span>
                  <div className="h-1 w-1 rounded-full bg-slate-700 light:bg-slate-300" />
                  <span className="t-label text-indigo-400/60 light:text-indigo-500">
                    {course.subject || 'General'}
                  </span>
                </div>
              </div>
            </div>
            <div
              className={`w-8 h-8 rounded-full bg-white/5 light:bg-slate-100 border border-white/5 light:border-slate-200 flex items-center justify-center transition-all duration-500 ${expandedCourseId === course.id ? 'rotate-180 bg-indigo-500/20 light:bg-indigo-100 text-white light:text-indigo-600' : 'text-slate-600 group-hover:text-slate-400 light:group-hover:text-slate-700'}`}
            >
              <ChevronDown className="w-4 h-4" />
            </div>
          </button>

          {expandedCourseId === course.id && (
            <div className="bg-black/20 light:bg-slate-50 border-t border-white/5 light:border-slate-200 p-4 space-y-2 animate-fade-in">
              {course.topics.length === 0 ? (
                <div className="py-10 text-center text-xs font-semibold text-slate-500 light:text-slate-500">
                  No topics yet
                </div>
              ) : (
                <div className="space-y-1">
                  {course.topics.map((topic, index) => (
                    <div
                      key={topic.id}
                      className="flex items-center justify-between p-3 rounded-2xl hover:bg-white/[0.03] light:hover:bg-slate-100 transition-all group/row"
                    >
                      <div className="flex items-center gap-5 flex-1 min-w-0">
                        <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-black/40 light:bg-slate-100 border border-white/5 light:border-slate-200 text-[10px] font-mono font-black text-indigo-400/40 light:text-indigo-400 group-hover/row:text-indigo-400 transition-colors shadow-inner shrink-0">
                          {(index + 1).toString().padStart(2, '0')}
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm text-slate-300 light:text-slate-700 font-bold tracking-wide truncate block">
                            {topic.name}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-medium text-slate-500 light:text-slate-500">
                              {topic.subTopics.length} sub-topic
                              {topic.subTopics.length === 1 ? '' : 's'}
                            </span>
                            {/* The two years live in one list here, so which
                                one a topic belongs to has to be visible —
                                otherwise a reorder looks like it shuffled
                                unrelated topics together. Only Year 11 is
                                marked: Year 12 is the default and marking it
                                would label almost every row for no gain. */}
                            {yearOfTopic(topic) === 'year11' && (
                              <span className="t-label px-1.5 py-px rounded-lg border bg-sky-500/10 light:bg-sky-50 text-sky-500 light:text-sky-700 border-sky-500/30 light:border-sky-300">
                                {yearShortLabel('year11')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => onMoveTopic(course.id, topic.id, 'up')}
                          disabled={index === 0}
                          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 light:bg-slate-100 border border-white/5 light:border-slate-200 text-slate-500 light:text-slate-500 hover:text-white hover:bg-indigo-600 light:hover:text-white light:hover:bg-indigo-600 light:hover:border-indigo-600 disabled:opacity-20 disabled:grayscale transition-all active:scale-90"
                          title="Move up"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onMoveTopic(course.id, topic.id, 'down')}
                          disabled={index === course.topics.length - 1}
                          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 light:bg-slate-100 border border-white/5 light:border-slate-200 text-slate-500 light:text-slate-500 hover:text-white hover:bg-indigo-600 light:hover:text-white light:hover:bg-indigo-600 light:hover:border-indigo-600 disabled:opacity-20 disabled:grayscale transition-all active:scale-90"
                          title="Move down"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      {courses.length === 0 && (
        <div className="py-20 text-center flex flex-col items-center gap-6">
          <div className="w-20 h-20 rounded-tile bg-white/5 light:bg-slate-100 flex items-center justify-center border border-white/5 light:border-slate-200 shadow-inner">
            <Hash className="w-10 h-10 text-white/10 light:text-slate-300" />
          </div>
          <p className="text-xs font-semibold text-slate-500 light:text-slate-500">
            No courses yet
          </p>
        </div>
      )}
    </div>
  );
};

export default TopicReorderList;
