"use client";

import { useRouter } from "next/navigation";
import { CircleHelp, MessageSquareText } from "lucide-react";
import { useUi } from "@/components/providers/ui-provider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function TopBarActions() {
  const router = useRouter();
  const { setAskOpen, setTourStep } = useUi();
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Ask the agent" onClick={() => setAskOpen(true)}>
            <MessageSquareText className="h-4 w-4" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Ask the agent</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="hidden sm:inline-flex"
            aria-label="Replay the guided tour"
            onClick={() => {
              router.push("/");
              setTourStep(0);
            }}
          >
            <CircleHelp className="h-4 w-4" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Replay the tour</TooltipContent>
      </Tooltip>
    </>
  );
}
