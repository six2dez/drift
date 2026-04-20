// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ApprovalDialog from "./ApprovalDialog.vue";
import type { McpToolApprovalRequest } from "shared";

const baseEvent: McpToolApprovalRequest = {
  sessionId: "sess-1",
  approvalId: "ap-1",
  toolName: "send_request",
  toolLabel: "Send request",
  group: "replay",
  argumentsSummary: '{"method":"GET","url":"http://example.com"}',
  message: "This tool sends an HTTP request via Caido.",
  sensitive: true,
};

function findButtonByText(
  wrapper: ReturnType<typeof mount>,
  text: string,
) {
  return wrapper.findAll("button").find((b) => b.text() === text);
}

describe("ApprovalDialog", () => {
  it("renders nothing when event is null", () => {
    const wrapper = mount(ApprovalDialog, { props: { event: null } });
    expect(wrapper.find("[role='dialog']").exists()).toBe(false);
  });

  it("renders tool label, group, sensitive badge, and arguments", () => {
    const wrapper = mount(ApprovalDialog, { props: { event: baseEvent } });
    expect(wrapper.find("[role='dialog']").exists()).toBe(true);
    const text = wrapper.text();
    expect(text).toContain("Send request");
    expect(text).toContain("replay");
    expect(text).toContain("sensitive");
    expect(text).toContain("method");
    expect(text).toContain("example.com");
  });

  it("omits the sensitive badge when event.sensitive is false", () => {
    const wrapper = mount(ApprovalDialog, {
      props: { event: { ...baseEvent, sensitive: false } },
    });
    expect(wrapper.text()).not.toContain("sensitive");
  });

  it("emits decide with approved:false when Deny is clicked", async () => {
    const wrapper = mount(ApprovalDialog, { props: { event: baseEvent } });
    await findButtonByText(wrapper, "Deny")?.trigger("click");
    expect(wrapper.emitted("decide")).toEqual([
      [{ approved: false, remember: "once" }],
    ]);
  });

  it("emits decide with approved:true, remember:once on Allow once", async () => {
    const wrapper = mount(ApprovalDialog, { props: { event: baseEvent } });
    await findButtonByText(wrapper, "Allow once")?.trigger("click");
    expect(wrapper.emitted("decide")).toEqual([
      [{ approved: true, remember: "once" }],
    ]);
  });

  it("emits decide with approved:true, remember:session on Allow for session", async () => {
    const wrapper = mount(ApprovalDialog, { props: { event: baseEvent } });
    await findButtonByText(wrapper, "Allow for session")?.trigger("click");
    expect(wrapper.emitted("decide")).toEqual([
      [{ approved: true, remember: "session" }],
    ]);
  });
});
