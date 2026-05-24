# @grokflow/ui

Shared UI primitives for GrokFlow plugin modules — Button, Modal, Card,
Input, Toast — themed via CSS variables so a module iframed into the core
admin shell looks native.

## Install

```bash
npm install @grokflow/ui
```

## Usage

```tsx
// main.tsx
import "@grokflow/ui/theme.css";
import { ToastProvider, listenForThemeMessages } from "@grokflow/ui";

listenForThemeMessages();   // accept theme from core via postMessage / URL

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ToastProvider>
    <App />
  </ToastProvider>
);
```

```tsx
// any component
import { Button, Modal, Card, Input, useToast } from "@grokflow/ui";

function MyPage() {
  const { toast } = useToast();
  return (
    <Card title="Hoá đơn">
      <Input placeholder="Search…" />
      <Button variant="primary" onClick={() => toast("Saved", "success")}>
        Save
      </Button>
    </Card>
  );
}
```

## Tailwind users (optional)

```js
// tailwind.config.js
module.exports = {
  presets: [require("@grokflow/ui/tailwind-preset")],
  content: ["./src/**/*.{ts,tsx}"],
};
```

## Theme contract

Components read these CSS variables (set by `theme.css` and overridable
via `applyTheme()` or `<iframe ?theme=...>`):

| Var | Default |
|---|---|
| `--gf-primary` | violet-600 |
| `--gf-bg` | white |
| `--gf-fg` | slate-900 |
| `--gf-border` | slate-200 |
| `--gf-radius` | 0.5rem |
| `--gf-success` | emerald-600 |
| `--gf-warning` | amber-600 |
| `--gf-danger` | rose-600 |

Set `data-gf-theme="dark"` on `<html>` to flip to the dark palette.

## Build / publish (maintainer)

```bash
npm run build           # tsup → dist/
npm version <patch|minor|major>
npm publish --access public
```
