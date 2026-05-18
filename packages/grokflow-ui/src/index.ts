/**
 * @grokflow/ui — components shared between core and plugin modules so
 * everything iframed into the admin shell looks native.
 *
 * Import once in your module's main.tsx:
 *   import "@grokflow/ui/theme.css";
 *
 * Then use:
 *   import { Button, Modal, useToast } from "@grokflow/ui";
 */
export { Button } from "./Button";
export type { ButtonProps, ButtonVariant } from "./Button";

export { Modal } from "./Modal";
export type { ModalProps } from "./Modal";

export { Card } from "./Card";
export type { CardProps } from "./Card";

export { Input } from "./Input";
export type { InputProps } from "./Input";

export { ToastProvider, useToast } from "./Toast";
export type { ToastOptions } from "./Toast";

export { applyTheme, listenForThemeMessages } from "./theme";
