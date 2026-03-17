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
          className={`rounded-[32px] overflow-hidden transition-all duration-500 border ${expandedCourseId === course.id ? 'bg-black/40 border-indigo-500/30 shadow-2xl' : 'bg-white/[0.03] border-white/5'}`}
        >
          <button
            onClick={() => toggleCourse(course.id)}
            className="w-full flex items-center justify-between p-6 hover:bg-white/5 transition-all text-left group"
          >
            <div className="flex items-center gap-6">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 border ${expandedCourseId === course.id ? 'bg-indigo-600 text-white border-white/20' : 'bg-white/5 text-slate-500 group-hover:text-slate-300 border-white/5'}`}
              >
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <span
                  className={`text-lg font-black tracking-tight italic uppercase leading-none block mb-1 ${expandedCourseId === course.id ? 'text-white' : 'text-slate-400 group-hover:text-white'}`}
                >
                  {course.name}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    {course.topics.length} Logic Modules
                  </span>
                  <div className="h-1 w-1 rounded-full bg-slate-700" />
                  <span className="text-[9px] font-black text-indigo-400/60 uppercase tracking-widest">
                    {course.subject || 'Standard'} Field
                  </span>
                </div>
              </div>
            </div>
            <div
              className={`w-8 h-8 rounded-full bg-white/5 border border-white/5 flex items-center justify-center transition-all duration-500 ${expandedCourseId === course.id ? 'rotate-180 bg-indigo-500/20 text-white' : 'text-slate-600 group-hover:text-slate-400'}`}
            >
              <ChevronDown className="w-4 h-4" />
            </div>
          </button>

          {expandedCourseId === course.id && (
            <div className="bg-black/20 border-t border-white/5 p-4 space-y-2 animate-fade-in">
              {course.topics.length === 0 ? (
                <div className="py-10 text-center text-[10px] font-black text-slate-600 uppercase tracking-[0.4em]">
                  No Modules Detected
                </div>
              ) : (
                <div className="space-y-1">
                  {course.topics.map((topic, index) => (
                    <div
                      key={topic.id}
                      className="flex items-center justify-between p-3 rounded-2xl hover:bg-white/[0.03] transition-all group/row"
                    >
                      <div className="flex items-center gap-5 flex-1 min-w-0">
                        <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-black/40 border border-white/5 text-[10px] font-mono font-black text-indigo-400/40 group-hover/row:text-indigo-400 transition-colors shadow-inner shrink-0">
                          {(index + 1).toString().padStart(2, '0')}
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm text-slate-300 font-black tracking-wide truncate block">
                            {topic.name}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">
                              {topic.subTopics.length} Sub-points
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 opacity-0 group-hover/row:opacity-100 transition-all translate-x-2 group-hover/row:translate-x-0">
                        <button
                          onClick={() => onMoveTopic(course.id, topic.id, 'up')}
                          disabled={index === 0}
                          className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/5 text-slate-500 hover:text-white hover:bg-indigo-600 disabled:opacity-20 disabled:grayscale transition-all active:scale-90"
                          title="Elevate"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onMoveTopic(course.id, topic.id, 'down')}
                          disabled={index === course.topics.length - 1}
                          className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/5 text-slate-500 hover:text-white hover:bg-indigo-600 disabled:opacity-20 disabled:grayscale transition-all active:scale-90"
                          title="Lower"
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
          <div className="w-20 h-20 rounded-[28px] bg-white/5 flex items-center justify-center border border-white/5 shadow-inner">
            <Hash className="w-10 h-10 text-white/10" />
          </div>
          <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.5em]">
            Inventory Empty
          </p>
        </div>
      )}
    </div>
  );
};

export default TopicReorderList;
