import type { HTMLAttributes, PropsWithChildren } from "react";

type TextTone = "default" | "muted" | "danger" | "success";
type TypographyProps<T extends HTMLElement> = PropsWithChildren<
  HTMLAttributes<T> & {
    tone?: TextTone;
  }
>;

function textClass(name: string, tone: TextTone = "default", className?: string) {
  return ["koz-text", name, `koz-text--${tone}`, className].filter(Boolean).join(" ");
}

export function Display({ tone, className, ...props }: TypographyProps<HTMLHeadingElement>) {
  return <h1 className={textClass("koz-display", tone, className)} {...props} />;
}

export function H1({ tone, className, ...props }: TypographyProps<HTMLHeadingElement>) {
  return <h1 className={textClass("koz-h1", tone, className)} {...props} />;
}

export function H2({ tone, className, ...props }: TypographyProps<HTMLHeadingElement>) {
  return <h2 className={textClass("koz-h2", tone, className)} {...props} />;
}

export function H3({ tone, className, ...props }: TypographyProps<HTMLHeadingElement>) {
  return <h3 className={textClass("koz-h3", tone, className)} {...props} />;
}

export function Body({ tone, className, ...props }: TypographyProps<HTMLParagraphElement>) {
  return <p className={textClass("koz-body", tone, className)} {...props} />;
}

export function Caption({ tone, className, ...props }: TypographyProps<HTMLSpanElement>) {
  return <span className={textClass("koz-caption", tone, className)} {...props} />;
}

export function Label({ tone, className, ...props }: TypographyProps<HTMLLabelElement>) {
  return <label className={textClass("koz-label", tone, className)} {...props} />;
}

export function ButtonText({ tone, className, ...props }: TypographyProps<HTMLSpanElement>) {
  return <span className={textClass("koz-button-text", tone, className)} {...props} />;
}
