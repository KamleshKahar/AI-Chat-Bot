'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { SuggestionChips } from '@/components/chat/SuggestionChips';
import { sendChatMessage, executePlan } from '@/lib/aiClient';
import { loadThread, saveThread, clearThread, createEntry, toConversation } from '@/lib/chatStore';

/** True when the plan touches data — only then must open list pages re-read. */
function planHasWrites(plan) {
  return (Array.isArray(plan?.actions) ? plan.actions : []).some(
    (action) => action && typeof action.method === 'string' && action.method !== 'GET'
  );
}

/**
 * Local summary for a confirmed plan.
 *
 * `/api/execute` deliberately returns no `reply` (that endpoint skips Gemini
 * entirely), so the confirmation turn's text is built here from the results
 * rather than spun up as a third model call. The wording never overstates:
 * a partial run says exactly that.
 */
function buildExecutionSummary(payload, plan) {
  const total = Array.isArray(plan?.actions) ? plan.actions.length : 0;
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const done = results.filter((item) => item?.success).length;

  if (payload?.success) {
    return done <= 1
      ? 'Done — the action completed successfully.'
      : `Done — all ${done} actions completed successfully.`;
  }
  if (done === 0) {
    return 'Nothing was executed — the first action failed. See the details below.';
  }
  return `Partially done — ${done} of ${total || results.length} actions completed, then execution stopped.`;
}

/** Three-dot "working" row shown while a request is in flight. */
function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0" />
      <div className="rounded-2xl rounded-tl-md bg-white border border-slate-200 px-4 py-3 shadow-2xs">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { invalidate } = useData();
  const { success, info, error: errorToast } = useToast();

  // Hydrated from localStorage in an effect, not in the initial state: the
  // route is prerendered, and a storage-backed first paint would disagree
  // with the server HTML (hydration mismatch).
  const [thread, setThread] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [executingId, setExecutingId] = useState(null);

  const scrollRef = useRef(null);

  useEffect(() => {
    setThread(loadThread());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveThread(thread);
  }, [thread, hydrated]);

  // Keep the newest message in view whenever the thread or flight state moves.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread, pending, hydrated]);

  const append = useCallback((entry) => {
    setThread((prev) => [...prev, entry]);
  }, []);

  const handleSend = useCallback(
    async (text) => {
      const message = typeof text === 'string' ? text.trim() : '';
      if (!message || pending) return;

      const userEntry = createEntry('user', message);
      const history = [...thread, userEntry];
      setThread(history);
      setInput('');
      setPending(true);

      try {
        const payload = await sendChatMessage(message, { conversation: toConversation(history) });

        if (payload?.requiresConfirmation) {
          append(
            createEntry(
              'assistant',
              payload.reply || 'Please review the proposed actions and confirm.',
              { kind: 'plan', plan: payload.plan, planStatus: 'pending' }
            )
          );
        } else if (payload?.executed) {
          append(
            createEntry('assistant', payload.reply || 'Here are the results.', {
              kind: 'result',
              results: Array.isArray(payload.results) ? payload.results : [],
              success: payload.success === true,
              totalActions: Array.isArray(payload.plan?.actions) ? payload.plan.actions.length : undefined,
            })
          );
          if (planHasWrites(payload.plan)) invalidate();
        } else {
          // The AI backend's envelope is a known shape; anything else is a bug
          // or a proxy fault, and pretending it succeeded would be worse than
          // saying so.
          append(
            createEntry('assistant', 'I got an unexpected response from the AI service.', {
              kind: 'error',
            })
          );
        }
      } catch (err) {
        append(
          createEntry('assistant', err?.message || 'Something went wrong. Please try again.', {
            kind: 'error',
          })
        );
      } finally {
        setPending(false);
      }
    },
    [append, invalidate, pending, thread]
  );

  const handleConfirmPlan = useCallback(
    async (message) => {
      if (!message?.plan || executingId || pending) return;

      setExecutingId(message.id);
      setThread((prev) =>
        prev.map((entry) =>
          entry.id === message.id ? { ...entry, planStatus: 'running' } : entry
        )
      );

      try {
        const payload = await executePlan(message.plan, { confirmed: true });
        const results = Array.isArray(payload?.results) ? payload.results : [];
        const ok = payload?.success === true;

        setThread((prev) => [
          ...prev.map((entry) =>
            entry.id === message.id ? { ...entry, planStatus: ok ? 'confirmed' : 'failed' } : entry
          ),
          createEntry('assistant', buildExecutionSummary(payload, message.plan), {
            kind: 'result',
            results,
            success: ok,
            totalActions: Array.isArray(message.plan?.actions)
              ? message.plan.actions.length
              : results.length,
          }),
        ]);

        // The AI wrote straight to the API, bypassing DataContext mutations, so
        // any open list page must be told to re-read.
        if (planHasWrites(message.plan)) invalidate();

        if (ok) {
          success('Action plan executed');
        } else {
          errorToast('Some actions failed — see the results below.');
        }
      } catch (err) {
        setThread((prev) => [
          ...prev.map((entry) =>
            entry.id === message.id ? { ...entry, planStatus: 'failed' } : entry
          ),
          createEntry('assistant', err?.message || 'Execution failed.', { kind: 'error' }),
        ]);
        errorToast(err?.message || 'Execution failed');
      } finally {
        setExecutingId(null);
      }
    },
    [errorToast, executingId, invalidate, pending, success]
  );

  const handleCancelPlan = useCallback((message) => {
    if (!message?.plan) return;
    setThread((prev) =>
      prev.map((entry) =>
        entry.id === message.id ? { ...entry, planStatus: 'cancelled' } : entry
      )
    );
  }, []);

  const handleClear = useCallback(() => {
    clearThread();
    setThread([]);
    info('Chat history cleared');
  }, [info]);

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend(input);
    }
  };

  return (
    <div className="space-y-6 h-full">
      <PageHeader
        title="AI Assistant"
        description="Ask questions about your business or request changes in plain language. Requests that modify data always require your confirmation first."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'AI Assistant' }]}
        actions={
          thread.length > 0 ? (
            <Button variant="outline" size="sm" icon={Trash2} onClick={handleClear}>
              Clear history
            </Button>
          ) : null
        }
      />

      <Card
        padded={false}
        className="overflow-hidden"
        bodyClassName="flex flex-col h-[calc(100vh-15rem)] min-h-[420px]"
      >
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
          {!hydrated ? null : thread.length === 0 && !pending ? (
            <div className="h-full">
              <SuggestionChips onPick={handleSend} disabled={pending} />
            </div>
          ) : (
            <div className="space-y-5">
              {thread.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  onConfirmPlan={handleConfirmPlan}
                  onCancelPlan={handleCancelPlan}
                />
              ))}
              {pending && <TypingIndicator />}
            </div>
          )}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSend(input);
          }}
          className="border-t border-slate-200 bg-slate-50/70 p-3 sm:p-4"
        >
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder="Ask about products, sales, customers or reports…"
              className="flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 max-h-32"
            />
            <Button
              type="submit"
              icon={Send}
              disabled={!input.trim() || pending || !hydrated}
              className="mb-0.5"
            >
              Send
            </Button>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Enter to send · Shift+Enter for a new line · Data changes run only after you
            confirm the proposed actions
          </p>
        </form>
      </Card>
    </div>
  );
}
