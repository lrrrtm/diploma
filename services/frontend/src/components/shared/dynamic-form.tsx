import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FieldDefinition } from "@/types";

interface DynamicFormProps {
  fields: FieldDefinition[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  disabled?: boolean;
}

export function DynamicForm({
  fields,
  values,
  onChange,
  disabled = false,
}: DynamicFormProps) {
  const handleChange = (name: string, value: string) => {
    onChange({ ...values, [name]: value });
  };

  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <div key={field.name} className="space-y-2">
          <Label htmlFor={field.name}>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>

          {field.type === "textarea" ? (
            <Textarea
              id={field.name}
              value={values[field.name] || ""}
              onChange={(e) => handleChange(field.name, e.target.value)}
              required={field.required}
              disabled={disabled}
              placeholder={field.label}
            />
          ) : field.type === "select" && field.options ? (
            <Select
              value={values[field.name] || undefined}
              onValueChange={(v) => handleChange(field.name, v)}
              disabled={disabled}
            >
              <SelectTrigger id={field.name}>
                <SelectValue placeholder="Выберите..." />
              </SelectTrigger>
              <SelectContent>
                {field.options.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={field.name}
              type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
              value={values[field.name] || ""}
              onChange={(e) => handleChange(field.name, e.target.value)}
              required={field.required}
              disabled={disabled}
              placeholder={field.label}
            />
          )}
        </div>
      ))}
    </div>
  );
}
