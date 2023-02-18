import { Setting, setIcon, DropdownComponent, ColorComponent } from "obsidian";
import { AttributeType, BooleanType, SizeType } from "src/utils/attributeType";

export class BaseTagSetting {
    attributes: Map<string, string | null> | Object = new Map();
    opened = false;

    generateTitle (header: HTMLElement, setting: HTMLElement, child = false): Setting {
        const title = new Setting(header)

        const title_ctl = title.nameEl.createEl("span", "tag-collapse-indicator is-collapsed")
        setIcon(title_ctl, "right-arrow")
        if (this.opened && !child) {
            setting.removeClass("is-collapsed")
            title_ctl.removeClass("is-collapsed")
        }
        header.onClickEvent(() => {
            setting.classList.toggle("is-collapsed")
            title_ctl.classList.toggle("is-collapsed")
            if (!child) {
                this.opened = !this.opened
            }
        })
        return title
    }

    addComponent (name: string, attributeType: AttributeType, settingItem: Setting, save: () => void, dropdownOptions = "") {
        const attr: Map<string, string | null> = this.attributes as Map<string, string | null>
        const value = attr.get(name)
        switch (attributeType) {
            case AttributeType.Boolean: {
                const dropdown = settingItem.addDropdown((cp) => {
                    cp.addOption(BooleanType.True, "True")
                        .addOption(BooleanType.False, "False")
                        .setValue(value || "")
                        .onChange((v) => {
                            attr.set(name, v)
                            this.attributes = attr
                            save()
                        })
                })
                settingItem.addButton((cp) => {
                    cp.setIcon("reset")
                        .setClass("small-button")
                        .onClick(() => {
                            const dropdownComponent = dropdown.components[0] as DropdownComponent
                            dropdownComponent.setValue("")
                            attr.set(name, null)
                            this.attributes = attr
                            save()
                        })
                })
                break
            }
            case AttributeType.Dropdown: {
                const options = dropdownOptions.split(",")
                const dropdown = settingItem.addDropdown((cp) => {
                    options.forEach((v) => {
                        cp.addOption(v, v)
                    })
                    cp.setValue(value || "")
                        .onChange((v) => {
                            attr.set(name, v)
                            this.attributes = attr
                            save()
                        })
                })
                settingItem.addButton((cp) => {
                    cp.setIcon("reset")
                        .setClass("small-button")
                        .onClick(() => {
                            const dropdownComponent = dropdown.components[0] as DropdownComponent
                            dropdownComponent.setValue("")
                            attr.set(name, null)
                            this.attributes = attr
                            save()
                        })
                })
                break
            }
            case AttributeType.Color: {
                const colorPicker = settingItem.addColorPicker((cp) => {
                    cp.setValue(value || "#000000")
                        .onChange((v) => {
                            attr.set(name, v)
                            this.attributes = attr
                            save()
                        })
                })
                settingItem.addButton((cp) => {
                    cp.setIcon("reset")
                        .setClass("small-button")
                        .onClick(() => {
                            const colorComponent = colorPicker.components[0] as ColorComponent
                            colorComponent.setValue("#000000")
                            attr.set(name, null)
                            this.attributes = attr
                            save()
                        })
                })
                break
            }
            case AttributeType.Size: {
                const regex = /([\d.]+)(.*)/gm.exec(value || "")
                let text = ""
                let unit = "px"
                if (regex != null) {
                    text = regex[1]
                    unit = regex[2]
                }
                settingItem.addText((cp) => {
                    cp.setValue(text)
                        .onChange((v) => {
                            let res: string | null = `${v}${unit}`
                            if (res == "") res = null
                            text = v
                            attr.set(name, res)
                            this.attributes = attr
                            save()
                        })
                }).setClass("small-input")
                settingItem.addDropdown((cp) => {
                    for (const [_, v] of Object.entries(SizeType)) {
                        cp.addOption(v, v)
                    }
                    cp.setValue(unit)
                        .onChange((v) => {
                            unit = v
                            attr.set(name, `${text}${unit}`)
                            this.attributes = attr
                            save()
                        })
                })
                break
            }
            default: {
                settingItem.addText((cp) => {
                    cp.setValue(value || "")
                        .onChange((v) => {
                            // TODO: TypeCheck
                            let res: string | null = v;
                            if (v == "") res = null;
                            attr.set(name, res);
                            this.attributes = attr
                            save()
                        })
                })
            }
        }
    }
}