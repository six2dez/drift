// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import ChatSidebar from "./ChatSidebar.vue";
import type { StoredChat } from "shared";

const ButtonStub = defineComponent({
  props: {
    label: { type: String, default: "" },
    icon: { type: String, default: "" },
  },
  template: "<button><slot />{{ label }}</button>",
});

function makeChat(overrides: Partial<StoredChat>): StoredChat {
  return {
    id: "c1",
    title: "New Chat",
    messages: [],
    providerId: "claude-cli",
    cliSessionId: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const chats: StoredChat[] = [
  makeChat({ id: "c1", title: "Request review" }),
  makeChat({ id: "c2", title: "Report draft" }),
  makeChat({
    id: "c3",
    title: "New Chat",
    messages: [
      {
        id: "m1",
        role: "user",
        content: "Look at this auth bypass in /admin panel",
        timestamp: 0,
        providerId: "claude-cli",
      },
    ],
  }),
];

describe("ChatSidebar filter", () => {
  it("shows all chats when the filter is empty", () => {
    const wrapper = mount(ChatSidebar, {
      props: { chats, activeChatId: null },
      global: { stubs: { Button: ButtonStub } },
    });
    expect(wrapper.text()).toContain("Request review");
    expect(wrapper.text()).toContain("Report draft");
    expect(wrapper.text()).toContain("New Chat");
  });

  it("filters chats by title case-insensitively", async () => {
    const wrapper = mount(ChatSidebar, {
      props: { chats, activeChatId: null },
      global: { stubs: { Button: ButtonStub } },
    });
    await wrapper.find("input[aria-label='Filter chats']").setValue("REPORT");
    expect(wrapper.text()).toContain("Report draft");
    expect(wrapper.text()).not.toContain("Request review");
    expect(wrapper.text()).toContain("1 of 3");
  });

  it("searches first message content only when the query is 3+ chars", async () => {
    const wrapper = mount(ChatSidebar, {
      props: { chats, activeChatId: null },
      global: { stubs: { Button: ButtonStub } },
    });
    await wrapper.find("input[aria-label='Filter chats']").setValue("auth");
    expect(wrapper.text()).toContain("New Chat");
    expect(wrapper.text()).not.toContain("Request review");
    expect(wrapper.text()).not.toContain("Report draft");
  });

  it("shows an empty-state line when no chat matches the filter", async () => {
    const wrapper = mount(ChatSidebar, {
      props: { chats, activeChatId: null },
      global: { stubs: { Button: ButtonStub } },
    });
    await wrapper.find("input[aria-label='Filter chats']").setValue("nonexistent");
    expect(wrapper.text()).toContain('No chats match "nonexistent"');
  });
});
