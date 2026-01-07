export type FieldType =
    | "text"
    | "textarea"
    | "number"
    | "select"
    | "multiselect"
    | "switch"
    | "chips" // lista di stringhe (ingredienti, ecc.)
    | "datetime"; // per events

export type FieldOption = { value: string; label: string };

export type BaseFieldKey = "name" | "description" | "base_price" | "duration";

export type FieldDef =
    | {
          key: BaseFieldKey;
          label: string;
          type: FieldType;
          storage: "base";
          placeholder?: string;
          helpText?: string;
          required?: boolean;
          options?: FieldOption[];
      }
    | {
          key: string;
          label: string;
          type: FieldType;
          storage: "metadata";
          placeholder?: string;
          helpText?: string;
          required?: boolean;
          options?: FieldOption[];
      };
