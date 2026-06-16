/**
 * Chat.tsx — the message list + input. During a game this is also where you
 * type guesses. Messages are styled by their `kind` (correct/close/system/...).
 */

import { useEffect, useRef, useState } from "react";
import { CHAT_MAX } from "@shared/types";
import type { ChatMessage } from "@shared/types";

interface Props {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  placeholder?: string;
}

export function Chat({ messages, onSend, placeholder = "Type your guess…" }: Props) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to the newest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  }

  return (
    <div className="chat">
      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.kind}`}>
            {m.name && <b>{m.name}: </b>}
            {m.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input
          type="text"
          value={text}
          maxLength={CHAT_MAX}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
        />
        <button type="submit" className="secondary">
          Send
        </button>
      </form>
    </div>
  );
}
