import { Modal, Setting } from "obsidian";

export interface FieldSpec {
  key: string;
  name: string;
  description?: string;
  placeholder?: string;
  type?: "text" | "textarea";
}

export class FormModal extends Modal {
  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly options: {
      title: string;
      fields: FieldSpec[];
      initial: Record<string, string>;
      submitLabel?: string;
      onSubmit: (values: Record<string, string>) => Promise<boolean | void>;
    },
  ) { super(app); }

  onOpen(): void {
    this.setTitle(this.options.title);
    this.contentEl.empty();
    const values = { ...this.options.initial };
    let firstInput: HTMLInputElement | HTMLTextAreaElement | null = null;
    for (const field of this.options.fields) {
      const setting = new Setting(this.contentEl).setName(field.name).setDesc(field.description || "");
      if (field.type === "textarea") {
        setting.addTextArea((component) => {
          component.setValue(values[field.key] || "").setPlaceholder(field.placeholder || "").onChange((value) => values[field.key] = value);
          component.inputEl.rows = 4;
          firstInput ||= component.inputEl;
        });
      } else {
        setting.addText((component) => {
          component.setValue(values[field.key] || "").setPlaceholder(field.placeholder || "").onChange((value) => values[field.key] = value);
          firstInput ||= component.inputEl;
        });
      }
    }
    const buttons = this.contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = buttons.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    const submit = buttons.createEl("button", { text: this.options.submitLabel || "Save", cls: "mod-cta" });
    submit.addEventListener("click", () => { void this.submit(values, submit); });
    window.setTimeout(() => firstInput?.focus(), 0);
  }

  private async submit(values: Record<string, string>, submit: HTMLButtonElement): Promise<void> {
      submit.disabled = true;
      try {
        if (await this.options.onSubmit(values) !== false) this.close();
      } finally { submit.disabled = false; }
  }
}
