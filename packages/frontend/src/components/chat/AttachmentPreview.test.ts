// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AttachmentPreview from "./AttachmentPreview.vue";
import type { HttpContextAttachment } from "shared";

const baseAttachment: HttpContextAttachment = {
  source: "request",
  label: "Request GET /api/users",
  size: 64,
  content: "GET /api/users HTTP/1.1\nHost: example.com",
};

describe("AttachmentPreview", () => {
  it("renders nothing when attachment is null", () => {
    const wrapper = mount(AttachmentPreview, { props: { attachment: null } });
    expect(wrapper.find("[role='dialog']").exists()).toBe(false);
  });

  it("renders the label and the raw content when attachment is set", () => {
    const wrapper = mount(AttachmentPreview, {
      props: { attachment: baseAttachment },
    });
    const text = wrapper.text();
    expect(text).toContain("Request GET /api/users");
    expect(text).toContain("example.com");
  });

  it("shows a fallback message when content is missing", () => {
    const wrapper = mount(AttachmentPreview, {
      props: { attachment: { ...baseAttachment, content: undefined } },
    });
    expect(wrapper.text()).toContain("content unavailable");
  });

  it("emits close when the close button is clicked", async () => {
    const wrapper = mount(AttachmentPreview, {
      props: { attachment: baseAttachment },
    });
    const closeButton = wrapper
      .findAll("button")
      .find((b) => b.attributes("aria-label") === "Close");
    expect(closeButton).toBeDefined();
    await closeButton?.trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("shows a Copy-as-curl button when the attachment is a request", () => {
    const wrapper = mount(AttachmentPreview, {
      props: {
        attachment: {
          ...baseAttachment,
          content: [
            "GET /api/ping HTTP/1.1",
            "Host: example.com",
            "Accept: application/json",
            "",
            "",
          ].join("\r\n"),
        },
      },
    });
    const curlButton = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Copy as curl"));
    expect(curlButton).toBeDefined();
    expect(curlButton!.attributes("title")).toContain("curl");
    expect(curlButton!.attributes("title")).toContain("example.com");
  });

  it("hides the Copy-as-curl button for response attachments", () => {
    const wrapper = mount(AttachmentPreview, {
      props: {
        attachment: {
          ...baseAttachment,
          source: "response",
          content: "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{}",
        },
      },
    });
    const curlButton = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Copy as curl"));
    expect(curlButton).toBeUndefined();
  });

  it("hides the Copy-as-curl button when the content cannot be parsed as HTTP", () => {
    const wrapper = mount(AttachmentPreview, {
      props: {
        attachment: {
          ...baseAttachment,
          content: "not a valid http request",
        },
      },
    });
    const curlButton = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Copy as curl"));
    expect(curlButton).toBeUndefined();
  });
});
