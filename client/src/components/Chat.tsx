/**
 * Chat.tsx — chat building blocks.
 *
 * Exposes three pieces so different screens can compose them:
 *  - <ChatMessages />  the scrolling colored message list (auto-scrolls)
 *  - <ChatInput />     just the text input form (Enter to send)
 *  - <Chat />          convenience wrapper that stacks input + messages,
 *                      with `inputPosition` deciding the order.
 *
 * During a game the input doubles as the guess box. Server tags each message
 * with a `kind` (normal/correct/close/system/insider) which we style.
 */

import { useEffect, useRef, useState } from "react";
import { CHAT_MAX } from "@shared/types";
import type { ChatMessage } from "@shared/types";

export function ChatMessages({ messages }: { messages: ChatMessage[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Newest message at top — scroll the panel itself to the top. We do NOT
  // use scrollIntoView here: on mobile it walks up the ancestor chain and
  // scrolls the whole page (yanking the canvas off-screen every time the
  // user sends a guess). Scrolling the container directly keeps the page
  // anchored where the user left it.
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [messages]);

  // Reverse a copy so the freshest message renders first. We also stripe
  // normal user messages with an alternating "odd" class for readability.
  const reversed = [...messages].reverse();
  let normalIdx = 0;

  return (
    <div className="chat-messages" ref={containerRef}>
      {reversed.map((m, i) => {
        const isNormal = m.kind === "normal";
        const odd = isNormal && normalIdx++ % 2 === 1;
        return (
          <div key={i} className={`chat-msg ${m.kind}${odd ? " odd" : ""}`}>
            {m.name && <b>{m.name}: </b>}
            {m.text}
          </div>
        );
      })}
    </div>
  );
}

export function ChatInput({
  onSend,
  placeholder = "Type your guess…",
}: {
  onSend: (text: string) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  }

  return (
    <form className="chat-form" onSubmit={submit}>
      <input
        // type="search" (not "text"): Chrome's autofill ignores search
        // fields, so we lose the key/card/pin chip row, but mobile
        // keyboards still treat it as freeform text and show word
        // predictions. CSS below hides the native clear-X button.
        type="search"
        value={text}
        maxLength={CHAT_MAX}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        // Mobile-keyboard tuning: we want Gboard/iOS to show normal word
        // predictions ("he" → "hello/hey"), NOT Chrome's autofill chips
        // (password / card / address). `autoComplete="off"` + a benign
        // `name` stops Chrome offering autofill; Gboard's predictions are
        // driven by inputMode/type, not autocomplete, so they still show.
        name="chat-message"
        autoComplete="off"
        autoCorrect="on"
        autoCapitalize="sentences"
        spellCheck={true}
        inputMode="text"
        enterKeyHint="send"
      />
      <span className="chat-form-count" aria-hidden="true" key={text.length}>
        {text.length}
      </span>
    </form>
  );
}

interface ChatProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  placeholder?: string;
  inputPosition?: "top" | "bottom";
}

export function Chat({
  messages,
  onSend,
  placeholder = "Type your guess…",
  inputPosition = "bottom",
}: ChatProps) {
  return (
    <div className={`chat input-${inputPosition}`}>
      {inputPosition === "top" && <ChatInput onSend={onSend} placeholder={placeholder} />}
      <ChatMessages messages={messages} />
      {inputPosition === "bottom" && <ChatInput onSend={onSend} placeholder={placeholder} />}
    </div>
  );
}
