declare module "markdown-it" {
  type MarkdownItOptions = {
    html?: boolean;
    linkify?: boolean;
    breaks?: boolean;
  };

  export default class MarkdownIt {
    constructor(options?: MarkdownItOptions);
    render(source: string): string;
  }
}
