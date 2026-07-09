import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  PropsWithChildren,
  ReactNode,
  SelectHTMLAttributes,
  TableHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useId } from "react";
import { Icon } from "./icons";

type Tone = "primary" | "neutral" | "danger" | "success" | "warning";
type Size = "sm" | "md" | "lg";

function cx(...classes: Array<string | number | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: Size;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth,
  leftIcon,
  rightIcon,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cx(
        "koz-button",
        `koz-button--${variant}`,
        `koz-button--${size}`,
        fullWidth && "koz-button--full",
        className,
      )}
      {...props}
    >
      {leftIcon}
      <span>{children}</span>
      {rightIcon}
    </button>
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export function Input({ invalid, className, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cx("koz-input", invalid && "koz-input--invalid", className)}
      {...props}
    />
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export function Textarea({ invalid, className, ...props }: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cx("koz-input", "koz-textarea", invalid && "koz-input--invalid", className)}
      {...props}
    />
  );
}

export type TextFieldProps = InputProps & {
  label?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
};

export function TextField({ label, helperText, error, id, className, ...props }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;

  return (
    <div className="koz-field">
      {label ? (
        <label className="koz-field__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <Input
        id={inputId}
        invalid={Boolean(error) || props.invalid}
        aria-describedby={helperText || error ? messageId : undefined}
        className={className}
        {...props}
      />
      {helperText || error ? (
        <span id={messageId} className={cx("koz-field__message", Boolean(error) && "koz-field__message--error")}>
          {error ?? helperText}
        </span>
      ) : null}
    </div>
  );
}

export type CheckboxProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
};

export function Checkbox({ label, className, ...props }: CheckboxProps) {
  return (
    <label className={cx("koz-choice", className)}>
      <input className="koz-choice__input" type="checkbox" {...props} />
      <span className="koz-choice__box" aria-hidden="true">
        <Icon name="check" size={14} />
      </span>
      {label ? <span>{label}</span> : null}
    </label>
  );
}

export type RadioProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
};

export function Radio({ label, className, ...props }: RadioProps) {
  return (
    <label className={cx("koz-choice", className)}>
      <input className="koz-choice__input" type="radio" {...props} />
      <span className="koz-choice__radio" aria-hidden="true" />
      {label ? <span>{label}</span> : null}
    </label>
  );
}

export type SwitchProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
};

export function Switch({ label, className, ...props }: SwitchProps) {
  return (
    <label className={cx("koz-switch", className)}>
      <input className="koz-switch__input" type="checkbox" {...props} />
      <span className="koz-switch__track" aria-hidden="true">
        <span className="koz-switch__thumb" />
      </span>
      {label ? <span>{label}</span> : null}
    </label>
  );
}

export type BadgeProps = PropsWithChildren<HTMLAttributes<HTMLSpanElement> & { tone?: Tone }>;

export function Badge({ tone = "primary", className, ...props }: BadgeProps) {
  return <span className={cx("koz-badge", `koz-badge--${tone}`, className)} {...props} />;
}

export type ChipProps = PropsWithChildren<HTMLAttributes<HTMLSpanElement> & { selected?: boolean }>;

export function Chip({ selected, className, ...props }: ChipProps) {
  return <span className={cx("koz-chip", selected && "koz-chip--selected", className)} {...props} />;
}

export type CardProps = PropsWithChildren<HTMLAttributes<HTMLDivElement> & { elevated?: boolean }>;

export function Card({ elevated, className, ...props }: CardProps) {
  return <div className={cx("koz-card", elevated && "koz-card--elevated", className)} {...props} />;
}

export type ModalProps = PropsWithChildren<{
  open: boolean;
  title?: ReactNode;
  onClose?: () => void;
  footer?: ReactNode;
  className?: string;
}>;

export function Modal({ open, title, children, footer, onClose, className }: ModalProps) {
  if (!open) return null;

  return (
    <div className="koz-overlay" role="presentation">
      <section
        className={cx("koz-modal", className)}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
      >
        <div className="koz-modal__header">
          {title ? <h2>{title}</h2> : null}
          {onClose ? (
            <button className="koz-icon-button" type="button" onClick={onClose} aria-label="Close">
              <Icon name="close" size={20} />
            </button>
          ) : null}
        </div>
        <div className="koz-modal__body">{children}</div>
        {footer ? <div className="koz-modal__footer">{footer}</div> : null}
      </section>
    </div>
  );
}

export type DrawerProps = PropsWithChildren<{
  open: boolean;
  title?: ReactNode;
  side?: "left" | "right";
  onClose?: () => void;
}>;

export function Drawer({ open, title, side = "right", children, onClose }: DrawerProps) {
  if (!open) return null;

  return (
    <div className="koz-overlay" role="presentation">
      <aside className={cx("koz-drawer", `koz-drawer--${side}`)} role="dialog" aria-modal="true">
        <div className="koz-modal__header">
          {title ? <h2>{title}</h2> : null}
          {onClose ? (
            <button className="koz-icon-button" type="button" onClick={onClose} aria-label="Close">
              <Icon name="close" size={20} />
            </button>
          ) : null}
        </div>
        <div className="koz-modal__body">{children}</div>
      </aside>
    </div>
  );
}

export type DialogProps = ModalProps;

export function Dialog(props: DialogProps) {
  return <Modal {...props} />;
}

export type ToastProps = PropsWithChildren<HTMLAttributes<HTMLDivElement> & { tone?: Tone; title?: ReactNode }>;

export function Toast({ tone = "neutral", title, children, className, ...props }: ToastProps) {
  return (
    <div className={cx("koz-toast", `koz-toast--${tone}`, className)} role="status" {...props}>
      {title ? <strong>{title}</strong> : null}
      {children ? <span>{children}</span> : null}
    </div>
  );
}

export function Spinner({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx("koz-spinner", className)} role="status" aria-label="Loading" {...props} />;
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("koz-skeleton", className)} aria-hidden="true" {...props} />;
}

export type AvatarProps = HTMLAttributes<HTMLDivElement> & {
  src?: string;
  name?: string;
};

export function Avatar({ src, name = "", className, ...props }: AvatarProps) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className={cx("koz-avatar", className)} aria-label={name || undefined} {...props}>
      {src ? <img src={src} alt="" /> : initials}
    </div>
  );
}

export type DividerProps = HTMLAttributes<HTMLHRElement> & {
  orientation?: "horizontal" | "vertical";
};

export function Divider({ orientation = "horizontal", className, ...props }: DividerProps) {
  return <hr className={cx("koz-divider", `koz-divider--${orientation}`, className)} {...props} />;
}

export type TabItem = {
  id: string;
  label: ReactNode;
  disabled?: boolean;
};

export type TabsProps = {
  items: TabItem[];
  value: string;
  onChange?: (value: string) => void;
};

export function Tabs({ items, value, onChange }: TabsProps) {
  return (
    <div className="koz-tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          className={cx("koz-tab", value === item.id && "koz-tab--active")}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          disabled={item.disabled}
          onClick={() => onChange?.(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export type DropdownProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode;
  options: Array<{ label: ReactNode; value: string; disabled?: boolean }>;
};

export function Dropdown({ label, options, id, className, ...props }: DropdownProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="koz-field">
      {label ? (
        <label className="koz-field__label" htmlFor={selectId}>
          {label}
        </label>
      ) : null}
      <select id={selectId} className={cx("koz-input", "koz-select", className)} {...props}>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export type PaginationProps = {
  page: number;
  pageCount: number;
  onPageChange?: (page: number) => void;
};

export function Pagination({ page, pageCount, onPageChange }: PaginationProps) {
  return (
    <nav className="koz-pagination" aria-label="Pagination">
      <Button
        variant="secondary"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange?.(page - 1)}
        leftIcon={<Icon name="chevronLeft" size={16} />}
      >
        Prev
      </Button>
      <span className="koz-pagination__label">
        {page} / {pageCount}
      </span>
      <Button
        variant="secondary"
        size="sm"
        disabled={page >= pageCount}
        onClick={() => onPageChange?.(page + 1)}
        rightIcon={<Icon name="chevronRight" size={16} />}
      >
        Next
      </Button>
    </nav>
  );
}

export type EmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ title, description, action, className, ...props }: EmptyStateProps) {
  return (
    <div className={cx("koz-empty", className)} {...props}>
      <div className="koz-empty__mark" aria-hidden="true" />
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action ? <div className="koz-empty__action">{action}</div> : null}
    </div>
  );
}

export function Loader({ label = "Loading" }: { label?: ReactNode }) {
  return (
    <div className="koz-loader" role="status">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export type TableColumn<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
};

export type TableProps<T> = TableHTMLAttributes<HTMLTableElement> & {
  columns: Array<TableColumn<T>>;
  data: T[];
  getRowKey: (row: T) => string;
  emptyText?: ReactNode;
};

export function Table<T>({ columns, data, getRowKey, emptyText = "No data", className, ...props }: TableProps<T>) {
  return (
    <div className="koz-table-wrap">
      <table className={cx("koz-table", className)} {...props}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length ? (
            data.map((row) => (
              <tr key={getRowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render(row)}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length}>{emptyText}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
