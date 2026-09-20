import { FormField, type FormFieldProps, type FormFieldRenderArgs } from "@components/ui/FormField/FormField";

/**
 * @deprecated — si rimuove nel lotto 6. È `FormField` con un altro nome:
 * stessa API, stesso render prop. I nuovi consumer importano `FormField`.
 */
export type InputBaseProps = FormFieldProps;
export type InputBaseRenderArgs = FormFieldRenderArgs;

/** @deprecated Usa `FormField` (`@components/ui/FormField/FormField`). */
export const InputBase = FormField;
