"use client";

import * as Select from "@radix-ui/react-select";
import { ChevronDown, ChevronUp, Check } from "lucide-react";
import { KNOWLEDGE_BASES, type KnowledgeBase } from "../lib/knowledge-bases";

export function KnowledgeBaseSelector({ value, onChange, disabled = false }: { value: KnowledgeBase; onChange: (next: KnowledgeBase) => void; disabled?: boolean }) {
  return (
    <div className="knowledge-base-control">
      <span className="knowledge-base-label">Active Knowledge Base</span>
      <Select.Root value={value} onValueChange={(next) => onChange(next as KnowledgeBase)} disabled={disabled}>
        <Select.Trigger className="knowledge-base-trigger" aria-label="Active knowledge base" title="Active knowledge base">
          <Select.Value placeholder="Select a knowledge base" />
          <Select.Icon>
            <ChevronDown size={16} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="knowledge-base-content" position="popper">
            <Select.ScrollUpButton className="knowledge-base-scroll-button">
              <ChevronUp size={14} />
            </Select.ScrollUpButton>
            <Select.Viewport className="knowledge-base-viewport">
              {KNOWLEDGE_BASES.map(item => (
                <Select.Item key={item.value} value={item.value} className="knowledge-base-item">
                  <Select.ItemText>{item.label}</Select.ItemText>
                  <Select.ItemIndicator className="knowledge-base-check">
                    <Check size={14} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
            <Select.ScrollDownButton className="knowledge-base-scroll-button">
              <ChevronDown size={14} />
            </Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

export function getKnowledgeBaseLabel(value: KnowledgeBase) {
  return KNOWLEDGE_BASES.find(item => item.value === value)?.label ?? selectedLabel(value);
}

function selectedLabel(value: KnowledgeBase) {
  switch (value) {
    case "banks":
      return "Banks";
    case "power":
      return "Power Plants";
    case "media":
      return "Media / Television Networks";
    default:
      return "Banks";
  }
}

export const KNOWLEDGE_BASE_SUMMARY: Record<KnowledgeBase, string> = {
  banks: "Banks",
  power: "Power Plants",
  media: "Media / Television Networks",
};
