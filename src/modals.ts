import { Modal, Platform, Setting } from "obsidian";

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
    this.modalEl.addClass("solomon-chat-form-modal");
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
    const status = this.contentEl.createDiv({ cls: "solomon-chat-form-status", attr: { role: "alert" } });
    const buttons = this.contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = buttons.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    const submit = buttons.createEl("button", { text: this.options.submitLabel || "Save", cls: "mod-cta" });
    submit.addEventListener("click", () => { void this.submit(values, submit, status); });
    if (!Platform.isMobile) window.setTimeout(() => firstInput?.focus(), 0);
  }

  private async submit(values: Record<string, string>, submit: HTMLButtonElement, status: HTMLElement): Promise<void> {
      submit.disabled = true;
      status.textContent = "";
      try {
        if (await this.options.onSubmit(values) !== false) this.close();
      } catch (error) {
        console.error("Solomon Chat: form action failed", error);
        status.textContent = error instanceof Error ? error.message : "The change could not be saved.";
      } finally { submit.disabled = false; }
  }
}

export class ConfirmModal extends Modal {
  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly options: {
      title: string;
      message: string;
      preview?: string;
      confirmLabel: string;
      onConfirm: () => Promise<boolean | void>;
    },
  ) { super(app); }

  onOpen(): void {
    this.modalEl.addClass("solomon-chat-confirm-modal");
    this.setTitle(this.options.title);
    this.contentEl.empty();
    this.contentEl.createEl("p", { text: this.options.message });
    if (this.options.preview) this.contentEl.createDiv({ cls: "solomon-chat-confirm-preview", text: this.options.preview });
    const status = this.contentEl.createDiv({ cls: "solomon-chat-confirm-status", attr: { role: "alert" } });
    const buttons = this.contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = buttons.createEl("button", { text: "Cancel" });
    const confirm = buttons.createEl("button", { text: this.options.confirmLabel, cls: "mod-warning" });
    cancel.addEventListener("click", () => this.close());
    confirm.addEventListener("click", () => { void this.confirm(confirm, cancel, status); });
    window.setTimeout(() => cancel.focus(), 0);
  }

  private async confirm(confirm: HTMLButtonElement, cancel: HTMLButtonElement, status: HTMLElement): Promise<void> {
    confirm.disabled = true;
    cancel.disabled = true;
    status.textContent = "";
    try {
      if (await this.options.onConfirm() !== false) this.close();
    } catch (error) {
      console.error("Solomon Chat: confirmation action failed", error);
      status.textContent = error instanceof Error ? error.message : "The action could not be completed.";
      confirm.disabled = false;
      cancel.disabled = false;
      cancel.focus();
    }
  }
}
