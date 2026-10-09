"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, MessageSquareText } from "lucide-react";
import { useUi } from "@/components/providers/ui-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useOpenSignals } from "@/lib/client/useSignals";
import { explain, type Explanation } from "@/lib/explain";

const SUGGESTIONS = ["Why Store A?", "Why Supplier B for TV-55-SM?", "Why is PO-001 a problem?", "Which stock is ageing?"];

/**
 * Explains signals that are already computed. It restates the engine's own
 * evidence and never produces new numbers (CLAUDE.md rule 1).
 */
export function AskAgent() {
  const router = useRouter();
  const { askOpen, setAskOpen } = useUi();
  const { data } = useOpenSignals();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ q: string; e: Explanation } | null>(null);

  const ask = (q: string) => {
    if (!q.trim() || !data) return;
    setQuestion(q);
    setAnswer({ q, e: explain(q, data.recommendations) });
  };

  return (
    <Dialog open={askOpen} onOpenChange={setAskOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareText className="h-4 w-4" aria-hidden="true" />
            Ask the agent
          </DialogTitle>
          <DialogDescription>Answers use only the numbers already computed for your signals.</DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
        >
          <label className="sr-only" htmlFor="ask-input">Question</label>
          <Input id="ask-input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Why Store A?" autoComplete="off" />
          <Button type="submit" disabled={!data || !question.trim()}>Ask</Button>
        </form>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {s}
            </button>
          ))}
        </div>
        {answer && (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-sm" aria-live="polite">
            <p className="text-xs font-medium text-muted-foreground">{answer.q}</p>
            {answer.e.lines.map((line, i) => (
              <p key={i} className={i === 0 ? "font-medium" : "text-foreground/90"}>{line}</p>
            ))}
            {answer.e.problemId && (
              <Button
                variant="link"
                className="h-auto w-fit p-0"
                onClick={() => {
                  setAskOpen(false);
                  router.push(`/signals?review=${encodeURIComponent(answer.e.problemId ?? "")}`);
                }}
              >
                Open this signal
                <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
