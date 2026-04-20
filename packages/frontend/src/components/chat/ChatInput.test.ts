// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import ChatInput from "./ChatInput.vue";

const mockSettingsStore = {
  isProviderAvailable: vi.fn(() => true),
};

vi.mock("../../stores/settings", () => ({
  useSettingsStore: () => mockSettingsStore,
}));

const ButtonStub = defineComponent({
  props: {
    label: { type: String, default: "" },
    disabled: { type: Boolean, default: false },
  },
  emits: ["click"],
  template: `<button :disabled="disabled" @click="$emit('click')">{{ label }}<slot /></button>`,
});

const SelectStub = defineComponent({
  props: {
    modelValue: { type: String, default: "" },
    options: { type: Array, default: () => [] },
    optionLabel: { type: String, default: "" },
    optionValue: { type: String, default: "" },
  },
  emits: ["update:modelValue"],
  template: `<select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)"><slot /></select>`,
});

const TextareaStub = defineComponent({
  props: {
    modelValue: { type: String, default: "" },
    placeholder: { type: String, default: "" },
  },
  emits: ["update:modelValue", "keydown"],
  template: `<textarea :value="modelValue" :placeholder="placeholder" @input="$emit('update:modelValue', $event.target.value)" @keydown="$emit('keydown', $event)" />`,
});

describe("ChatInput", () => {
  beforeEach(() => {
    mockSettingsStore.isProviderAvailable.mockReset();
    mockSettingsStore.isProviderAvailable.mockReturnValue(true);
  });

  it("shows workflow-oriented presets and removes scan-style actions", () => {
    const wrapper = mount(ChatInput, {
      props: {
        provider: "claude-cli",
        isStreaming: false,
      },
      global: {
        stubs: {
          Button: ButtonStub,
          Select: SelectStub,
          Textarea: TextareaStub,
        },
      },
    });

    expect(wrapper.text()).toContain("Review Request");
    expect(wrapper.text()).toContain("Validate Hypothesis");
    expect(wrapper.text()).toContain("Write Report");
    expect(wrapper.text()).not.toContain("Find Vulns");
    expect(wrapper.text()).not.toContain("Scan Scope");
  });

  it("starts with workflows collapsed when the chat already has messages", async () => {
    const wrapper = mount(ChatInput, {
      props: {
        provider: "claude-cli",
        isStreaming: false,
        hasMessages: true,
      },
      global: {
        stubs: {
          Button: ButtonStub,
          Select: SelectStub,
          Textarea: TextareaStub,
        },
      },
    });

    const toggle = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Show workflows"));
    expect(toggle).toBeDefined();
    expect(toggle!.attributes("aria-expanded")).toBe("false");

    await toggle?.trigger("click");

    const toggleAfter = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Hide workflows"));
    expect(toggleAfter).toBeDefined();
    expect(toggleAfter!.attributes("aria-expanded")).toBe("true");
  });

  it("starts with workflows expanded when the chat has no messages", () => {
    const wrapper = mount(ChatInput, {
      props: {
        provider: "claude-cli",
        isStreaming: false,
        hasMessages: false,
      },
      global: {
        stubs: {
          Button: ButtonStub,
          Select: SelectStub,
          Textarea: TextareaStub,
        },
      },
    });

    const toggle = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Hide workflows"));
    expect(toggle).toBeDefined();
    expect(toggle!.attributes("aria-expanded")).toBe("true");
  });

  it("fills the textarea with the selected workflow prompt", async () => {
    const wrapper = mount(ChatInput, {
      props: {
        provider: "claude-cli",
        isStreaming: false,
      },
      global: {
        stubs: {
          Button: ButtonStub,
          Select: SelectStub,
          Textarea: TextareaStub,
        },
      },
    });

    const workflowButton = wrapper.findAll("button").find((button) =>
      button.text().includes("Validate Hypothesis")
    );

    expect(workflowButton).toBeDefined();
    await workflowButton?.trigger("click");

    const textarea = wrapper.find("textarea");
    expect((textarea.element as HTMLTextAreaElement).value).toContain(
      "Help me validate a security hypothesis in the active Caido context.",
    );
  });
});
