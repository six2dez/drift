// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import MessageBubble from "./MessageBubble.vue";
import type { ChatMessage } from "shared";

function assistantMessage(content: string): ChatMessage {
  return {
    id: "m1",
    role: "assistant",
    content,
    timestamp: 0,
    providerId: "claude-cli",
  };
}

function userMessageWithAttachment(content: string, attachmentContent: string | undefined): ChatMessage {
  return {
    id: "m2",
    role: "user",
    content,
    timestamp: 0,
    providerId: "claude-cli",
    httpContextAttachment: {
      source: "request",
      label: "Request GET /api/users",
      size: 128,
      content: attachmentContent,
    },
  };
}

describe("MessageBubble", () => {
  it("renders assistant markdown as sanitized HTML", () => {
    const wrapper = mount(MessageBubble, {
      props: { message: assistantMessage("**bold** and _italic_") },
    });
    expect(wrapper.html()).toContain("<strong>bold</strong>");
    expect(wrapper.html()).toContain("<em>italic</em>");
  });

  it("applies highlight.js classes to fenced code blocks", () => {
    const fencedJs = "```js\nconst x = 1;\n```";
    const wrapper = mount(MessageBubble, {
      props: { message: assistantMessage(fencedJs) },
    });
    const html = wrapper.html();
    expect(html).toContain("hljs");
    expect(html).toMatch(/hljs-(keyword|built_in|literal|number)/);
  });

  it("emits preview-attachment when the chip is clicked and content is present", async () => {
    const wrapper = mount(MessageBubble, {
      props: { message: userMessageWithAttachment("look at this", "GET /api/users HTTP/1.1\nHost: example.com") },
    });
    const chip = wrapper.findAll("button").find((b) => b.text().includes("Request"));
    expect(chip).toBeDefined();
    expect(chip!.attributes("disabled")).toBeUndefined();
    await chip?.trigger("click");
    expect(wrapper.emitted("preview-attachment")).toHaveLength(1);
  });

  it("disables the attachment chip when content is unavailable (after reload)", () => {
    const wrapper = mount(MessageBubble, {
      props: { message: userMessageWithAttachment("look at this", undefined) },
    });
    const chip = wrapper.findAll("button").find((b) => b.text().includes("Request"));
    expect(chip).toBeDefined();
    expect(chip!.attributes("disabled")).toBe("");
  });

  it("renders a token usage footer when the assistant message has usage data", () => {
    const message: ChatMessage = {
      ...assistantMessage("done"),
      usage: { inputTokens: 3210, outputTokens: 1100, cacheReadTokens: 800 },
    };
    const wrapper = mount(MessageBubble, { props: { message } });
    const text = wrapper.text();
    expect(text).toContain("3.2k in");
    expect(text).toContain("1.1k out");
    expect(text).toContain("800 cached");
  });

  it("omits the usage footer when no tokens were reported", () => {
    const wrapper = mount(MessageBubble, {
      props: { message: assistantMessage("done") },
    });
    expect(wrapper.text()).not.toMatch(/\d+k? in/);
  });

  it("escapes raw HTML in assistant content rather than rendering it", () => {
    const wrapper = mount(MessageBubble, {
      props: {
        message: assistantMessage("<img src=x onerror=alert(1)>"),
      },
    });
    // markdown-it is configured with html: false, so raw HTML must end up as
    // escaped text, not as a real <img> element.
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.html()).toContain("&lt;img");
  });
});
