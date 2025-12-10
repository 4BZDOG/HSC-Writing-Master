import React, { useState } from 'react';
import { Course } from '../../types';
import { ChevronDown, ChevronRight, ArrowUp, ArrowDown, Layers, BookOpen } from 'lucide-react';

interface TopicReorderListProps {
  courses: Course[];
  onMoveTopic: (courseId: string, topicId: string, direction: 'up' | 'down') => void;
}

const TopicReorderList = ({ courses, onMoveTopic }: TopicReorderListProps) => {
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);

  const toggleCourse = (id: string) => {
    setExpandedCourseId(prev => prev === id ? null : id);
  };

  return (
    <div className="space-y-4">
        {courses.map(course => (
            <div key={course.id} className="border border-[rgb(var(--color-border-secondary))] rounded-xl overflow-hidden bg-[rgb(var(--color-bg-surface))]">
                <button 
                    onClick={() => toggleCourse(course.id)}
                    className="w-full flex items-center justify-between p-4 hover:bg-[rgb(var(--color-bg-surface-light))] transition-colors text-left"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
                             <BookOpen className="w-4 h-4" />
                        </div>
                        <div>
                            <span className="text-sm font-bold text-[rgb(var(--color-text-primary))]">{course.name}</span>
                            <div className="text-xs text-[rgb(var(--color-text-muted))] mt-0.5">{course.topics.length} Topics</div>
                        </div>
                    </div>
                    {expandedCourseId === course.id 
                        ? <ChevronDown className="w-5 h-5 text-[rgb(var(--color-text-muted))]" /> 
                        : <ChevronRight className="w-5 h-5 text-[rgb(var(--color-text-muted))]" />
                    }
                </button>

                {expandedCourseId === course.id && (
                    <div className="bg-[rgb(var(--color-bg-surface-inset))]/30 border-t border-[rgb(var(--color-border-secondary))] p-2">
                        {course.topics.length === 0 ? (
                            <p className="text-xs text-[rgb(var(--color-text-muted))] text-center py-2">No topics in this course.</p>
                        ) : (
                            <div className="space-y-1">
                                {course.topics.map((topic, index) => (
                                    <div key={topic.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-[rgb(var(--color-bg-surface-light))] transition-colors group">
                                        <div className="flex items-center gap-3">
                                            <div className="w-6 h-6 flex items-center justify-center rounded bg-[rgb(var(--color-bg-surface))] border border-[rgb(var(--color-border-secondary))] text-xs font-mono text-[rgb(var(--color-text-muted))]">
                                                {index + 1}
                                            </div>
                                            <Layers className="w-4 h-4 text-purple-400 opacity-70" />
                                            <span className="text-sm text-[rgb(var(--color-text-secondary))] font-medium">{topic.name}</span>
                                        </div>
                                        
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={() => onMoveTopic(course.id, topic.id, 'up')}
                                                disabled={index === 0}
                                                className="p-1.5 rounded hover:bg-[rgb(var(--color-bg-surface-elevated))] text-[rgb(var(--color-text-muted))] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                                                title="Move Up"
                                            >
                                                <ArrowUp className="w-4 h-4" />
                                            </button>
                                            <button 
                                                onClick={() => onMoveTopic(course.id, topic.id, 'down')}
                                                disabled={index === course.topics.length - 1}
                                                className="p-1.5 rounded hover:bg-[rgb(var(--color-bg-surface-elevated))] text-[rgb(var(--color-text-muted))] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                                                title="Move Down"
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
             <div className="text-center py-8 text-[rgb(var(--color-text-muted))] text-sm">
                 No courses available to reorder.
             </div>
        )}
    </div>
  );
};

export default TopicReorderList;