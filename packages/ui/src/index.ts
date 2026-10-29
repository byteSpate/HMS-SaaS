// Design-system components, built in-house on semantic HTML (ADR-022). Design tokens and base
// styles are exported as `@hms/ui/styles.css`. Feature screens import everything from here
// (T-UI-01, ADR-022 section 9: raw widgets, color literals and formatting stay out of apps).
export { Icon, type IconProps } from './icons/Icon.js';
export { iconNames, isIconName, type IconName } from './icons/icon-names.js';
export {
  Button,
  IconButton,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  type IconButtonProps,
} from './primitives/Button.js';
export { buttonClassName, iconButtonClassName } from './primitives/button-styles.js';
export { Checkbox, type CheckboxProps } from './primitives/Checkbox.js';
export { TextInput, type TextInputProps } from './primitives/TextInput.js';
export { TextArea, type TextAreaProps } from './primitives/TextArea.js';
export { Select, type SelectOption, type SelectProps } from './primitives/Select.js';
export { Field, type FieldControlProps, type FieldProps } from './primitives/Field.js';
export { Skeleton, type SkeletonProps } from './primitives/Skeleton.js';
export {
  StatusBadge,
  type StatusBadgeProps,
  type StatusBadgeSize,
  type StatusKind,
} from './primitives/StatusBadge.js';
export { Dialog, type DialogProps, type DialogSize } from './primitives/Dialog.js';
export { Menu, type MenuItem, type MenuProps, type MenuTriggerProps } from './primitives/Menu.js';
export { Tabs, type TabItem, type TabsProps } from './primitives/Tabs.js';
export { Combobox, type ComboboxOption, type ComboboxProps } from './primitives/Combobox.js';
export {
  ToastProvider,
  useToast,
  type ToastOptions,
  type ToastProviderProps,
  type ToastTone,
} from './primitives/Toast.js';
export { announce } from './hooks/announcer.js';
export { useControllableState } from './hooks/use-controllable-state.js';
export {
  AppShell,
  type AppShellProps,
  type NavItem,
  type ShellLinkProps,
} from './layouts/AppShell.js';
export { AuthLayout, type AuthLayoutProps } from './layouts/AuthLayout.js';
export { PageLayout, type PageLayoutProps } from './layouts/PageLayout.js';
export {
  LanguageSwitch,
  type LanguageOption,
  type LanguageSwitchProps,
} from './patterns/LanguageSwitch.js';
export { DesktopOnlyNotice, type DesktopOnlyNoticeProps } from './patterns/DesktopOnlyNotice.js';
export {
  SessionExpiryDialog,
  type SessionExpiryDialogProps,
} from './patterns/SessionExpiryDialog.js';
export { Alert, type AlertProps, type AlertTone } from './patterns/Alert.js';
