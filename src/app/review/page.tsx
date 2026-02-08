'use client';

import { useState, useEffect } from 'react';

interface Answer {
  questionId: string;
  questionText: string;
  answer: string;
}

interface Rule {
  type: string;
  vendor: string;
  tagType: string;
  value: string;
  certaintyPct: number;
  reason: string;
}

interface Session {
  id: string;
  name: string;
  updatedAt: string;
  rules?: Rule[];
  answers?: Answer[];
}

type FilterType = 'all' | 'yes' | 'no' | 'detailed';

export default function ReviewPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [editingAnswer, setEditingAnswer] = useState<Answer | null>(null);
  const [editValue, setEditValue] = useState<'yes' | 'no' | 'other'>('yes');
  const [editDetailedText, setEditDetailedText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const loadSession = async () => {
      try {
        // Get the current session ID from localStorage
        const sessionData = localStorage.getItem('tagquest_current_session');
        if (!sessionData) {
          setLoading(false);
          return;
        }

        const { id } = JSON.parse(sessionData);
        const res = await fetch(`/api/sessions/${id}`);
        const data: Session = await res.json();

        setSession(data);
        setAnswers(data.answers || []);
        setRules(data.rules || []);
      } catch (error) {
        console.error('Failed to load session:', error);
      }
      setLoading(false);
    };

    loadSession();
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  };

  const isDetailedAnswer = (answer: string) => {
    return answer !== 'yes' && answer !== 'no';
  };

  const filteredAnswers = answers.filter(a => {
    switch (filter) {
      case 'yes':
        return a.answer === 'yes';
      case 'no':
        return a.answer === 'no';
      case 'detailed':
        return isDetailedAnswer(a.answer);
      default:
        return true;
    }
  });

  const startEdit = (answer: Answer) => {
    setEditingAnswer(answer);
    if (answer.answer === 'yes') {
      setEditValue('yes');
      setEditDetailedText('');
    } else if (answer.answer === 'no') {
      setEditValue('no');
      setEditDetailedText('');
    } else {
      setEditValue('other');
      setEditDetailedText(answer.answer);
    }
  };

  const cancelEdit = () => {
    setEditingAnswer(null);
    setEditValue('yes');
    setEditDetailedText('');
  };

  const saveEdit = async () => {
    if (!editingAnswer || !session) return;

    const newAnswer = editValue === 'other' ? editDetailedText.trim() : editValue;
    if (editValue === 'other' && !newAnswer) return;

    setSaving(true);

    // Determine the old and new answer types
    const oldAnswer = editingAnswer.answer;
    const wasYes = oldAnswer === 'yes';
    const isNowYes = newAnswer === 'yes';

    // Update the answers array
    const updatedAnswers = answers.map(a =>
      a.questionId === editingAnswer.questionId
        ? { ...a, answer: newAnswer }
        : a
    );

    // Handle rule changes
    let updatedRules = [...rules];

    // Extract vendor from questionId (format: vendor-genre-VendorName or vendor-decade-VendorName)
    const questionIdParts = editingAnswer.questionId.split('-');
    const tagType = questionIdParts[1]; // 'genre' or 'decade'
    const vendor = questionIdParts.slice(2).join('-'); // Handle vendor names with hyphens

    if (wasYes && !isNowYes) {
      // Remove the rule that was created by this answer
      updatedRules = rules.filter(r => {
        return !(r.vendor === vendor && r.tagType === tagType);
      });
    } else if (!wasYes && isNowYes) {
      // Need to recreate the rule - extract suggested value from question text
      const match = editingAnswer.questionText.match(/be "([^"]+)"\?/);
      if (match) {
        const suggestedValue = match[1];
        // Find existingPct from question context or use default
        const newRule: Rule = {
          type: `vendor-${tagType}`,
          vendor: vendor,
          tagType: tagType,
          value: suggestedValue,
          certaintyPct: 85, // Default certainty when recreating
          reason: 'User confirmed (edited)'
        };
        updatedRules.push(newRule);
      }
    }

    try {
      // Save to server
      await fetch(`/api/sessions/${session.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: updatedAnswers,
          rules: updatedRules
        })
      });

      setAnswers(updatedAnswers);
      setRules(updatedRules);
      setEditingAnswer(null);
      showToast('Answer updated!');
    } catch (error) {
      console.error('Failed to save:', error);
      showToast('Failed to save');
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-fuchsia-600 via-violet-600 to-indigo-700 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="text-5xl mb-4">🏷️</div>
          <div className="animate-pulse">Loading...</div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-fuchsia-600 via-violet-600 to-indigo-700 p-4 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md text-center">
          <div className="text-5xl mb-4">😕</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">No Session Found</h1>
          <p className="text-gray-500 text-sm mb-4">
            Please start a session from the main app first.
          </p>
          <button
            onClick={() => window.location.href = '/'}
            className="w-full p-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white font-bold active:scale-95 transition-all"
          >
            Go to Tag Quest
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-fuchsia-600 via-violet-600 to-indigo-700 p-3 pb-safe">
      {/* Toast */}
      {toast && (
        <div className="fixed top-safe right-3 bg-emerald-500 text-white px-4 py-2 rounded-full shadow-lg z-50 text-sm font-bold animate-bounce">
          {toast}
        </div>
      )}

      <div className="max-w-2xl mx-auto pt-safe">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.location.href = '/'}
              className="p-2 text-white/70 hover:text-white active:scale-95 transition-all"
            >
              ← Back
            </button>
            <div>
              <h1 className="text-xl font-bold text-white">Answer Review</h1>
              <p className="text-white/70 text-sm">{session.name}</p>
            </div>
          </div>
          <div className="text-white/70 text-sm">
            {answers.length} answers
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white rounded-xl p-2 mb-4 flex gap-2 overflow-x-auto">
          {(['all', 'yes', 'no', 'detailed'] as FilterType[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all ${
                filter === f
                  ? 'bg-violet-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'all' && `All (${answers.length})`}
              {f === 'yes' && `Yes (${answers.filter(a => a.answer === 'yes').length})`}
              {f === 'no' && `No (${answers.filter(a => a.answer === 'no').length})`}
              {f === 'detailed' && `Detailed (${answers.filter(a => isDetailedAnswer(a.answer)).length})`}
            </button>
          ))}
        </div>

        {/* Answer List */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {filteredAnswers.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-4xl mb-2">📭</div>
              <p className="text-gray-500">No answers match this filter</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredAnswers.map((answer) => {
                const originalIndex = answers.findIndex(a => a.questionId === answer.questionId) + 1;
                return (
                  <div
                    key={answer.questionId}
                    className={`p-4 hover:bg-gray-50 transition-colors ${
                      isDetailedAnswer(answer.answer)
                        ? 'bg-amber-50/50'
                        : answer.answer === 'yes'
                        ? 'bg-emerald-50/50'
                        : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {originalIndex}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-800 font-medium">{answer.questionText}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                            isDetailedAnswer(answer.answer)
                              ? 'bg-amber-100 text-amber-700'
                              : answer.answer === 'yes'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {isDetailedAnswer(answer.answer) ? (
                              <>📝 {answer.answer}</>
                            ) : answer.answer === 'yes' ? (
                              <>✓ Yes</>
                            ) : (
                              <>✗ No</>
                            )}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => startEdit(answer)}
                        className="px-3 py-1 text-violet-600 hover:bg-violet-100 rounded-lg text-sm font-medium transition-all"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Stats Summary */}
        <div className="mt-4 bg-white/20 backdrop-blur rounded-xl p-4 text-white">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">{answers.filter(a => a.answer === 'yes').length}</div>
              <div className="text-sm text-white/70">Yes answers</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{answers.filter(a => a.answer === 'no').length}</div>
              <div className="text-sm text-white/70">No answers</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{rules.length}</div>
              <div className="text-sm text-white/70">Rules created</div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editingAnswer && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 pb-safe">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-lg font-bold text-gray-800">Edit Answer</h2>
              <button
                onClick={cancelEdit}
                className="p-2 text-gray-400 text-xl hover:text-gray-600"
              >
                ×
              </button>
            </div>

            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-800 font-medium text-sm">{editingAnswer.questionText}</p>
            </div>

            <div className="space-y-3 mb-4">
              <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="answer"
                  checked={editValue === 'yes'}
                  onChange={() => setEditValue('yes')}
                  className="w-5 h-5 text-violet-600"
                />
                <span className="font-medium text-gray-800">Yes</span>
                <span className="text-xs text-emerald-600 ml-auto">Creates rule</span>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="answer"
                  checked={editValue === 'no'}
                  onChange={() => setEditValue('no')}
                  className="w-5 h-5 text-violet-600"
                />
                <span className="font-medium text-gray-800">No</span>
                <span className="text-xs text-gray-400 ml-auto">No rule</span>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="answer"
                  checked={editValue === 'other'}
                  onChange={() => setEditValue('other')}
                  className="w-5 h-5 text-violet-600"
                />
                <span className="font-medium text-gray-800">Other</span>
                <span className="text-xs text-amber-600 ml-auto">Custom note</span>
              </label>
            </div>

            {editValue === 'other' && (
              <textarea
                value={editDetailedText}
                onChange={e => setEditDetailedText(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-lg p-3 text-sm text-black placeholder-gray-400 mb-4"
                placeholder="Enter your detailed answer..."
                autoFocus
              />
            )}

            <div className="flex gap-3">
              <button
                onClick={cancelEdit}
                className="flex-1 p-3 bg-gray-100 text-gray-600 rounded-xl font-bold active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={saving || (editValue === 'other' && !editDetailedText.trim())}
                className="flex-1 p-3 bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white rounded-xl font-bold active:scale-95 transition-all disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
