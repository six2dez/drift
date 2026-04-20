declare module "markdown-it" {
  type MarkdownItOptions = {
    html?: boolean;
    linkify?: boolean;
    breaks?: boolean;
  };

  export default class MarkdownIt {
    constructor(options?: MarkdownItOptions);
    render(source: string): string;
    use<TOptions = unknown>(
      plugin: (md: MarkdownIt, opts?: TOptions) => void,
      opts?: TOptions,
    ): this;
  }
}

declare module "markdown-it-highlightjs" {
  import type MarkdownIt from "markdown-it";
  type HighlightjsOptions = {
    hljs?: unknown;
    auto?: boolean;
    code?: boolean;
    inline?: boolean;
    ignoreIllegals?: boolean;
  };
  const highlightjs: (md: MarkdownIt, opts?: HighlightjsOptions) => void;
  export default highlightjs;
}
