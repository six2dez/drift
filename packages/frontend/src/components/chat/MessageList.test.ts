// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import MessageList from "./MessageList.vue";
import { EMPTY_CHAT_WORKFLOWS } from "../../chat-workflows";

describe("MessageList", () => {
  it("renders workflow cards in the empty state", () => {
    const wrapper = mount(MessageList, {
      props: {
        messages: [],
        workflows: EMPTY_CHAT_WORKFLOWS,
      },
      global: {
        stubs: {
          MessageBubble: {
            template: "<div />",
          },
        },
      },
    });

    expect(wrapper.text()).toContain("Start with a workflow");
    expect(wrapper.text()).toContain("Review");
    expect(wrapper.text()).toContain("Validate");
    expect(wrapper.text()).toContain("Report");
    expect(wrapper.text()).toContain("Build Test Plan");
  });

  it("emits the selected workflow prompt", async () => {
    const wrapper = mount(MessageList, {
      props: {
        messages: [],
        workflows: EMPTY_CHAT_WORKFLOWS,
      },
      global: {
        stubs: {
          MessageBubble: {
            template: "<div />",
          },
        },
      },
    });

    const buildPlanButton = wrapper.findAll("button").find((button) =>
      button.text().includes("Build Test Plan")
    );

    expect(buildPlanButton).toBeDefined();
    await buildPlanButton?.trigger("click");

    expect(wrapper.emitted("use-example")).toEqual([
      [
        "Help me validate a security hypothesis in the active Caido context. Build a focused test plan with the best payloads to try, the exact request mutations to send, and what outcomes would confirm or refute the issue.",
      ],
    ]);
  });
});
