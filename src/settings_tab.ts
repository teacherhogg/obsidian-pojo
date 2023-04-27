import { App, ButtonComponent, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import PojoPlugin from "./main";
import { PojoSettings } from "./settings";
import { Pojo } from "./provider/pojo_provider";

export default class PojoSettingsTab extends PluginSettingTab {

    private plugin: PojoPlugin;
    private isReloadingWords: boolean;

    constructor(app: App, plugin: PojoPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    async display (): any {
        const { containerEl } = this;

        console.log("HELLO from settings tab ", this.plugin);

        containerEl.empty();

        let platforminfo;
        try {
            platforminfo = await Pojo.getPlatformInfoProvider(this.plugin.app.vault);
        } catch (err) {
            console.error("ERROR getting platform info:", err);
            platforminfo = err.message;
        }

        new Setting(containerEl)
            .setName("Device Info")
            .setDesc(platforminfo);

        let plugininfo;
        try {
            plugininfo = this.plugin.manifest.version;
        } catch (err) {
            console.error("ERROR getting plugin info:", err);
            plugininfo = err.message;
        }

        new Setting(containerEl)
            .setName("POJO Version")
            .setDesc(plugininfo);

        new Setting(containerEl)
            .setName("Settings Version")
            .setDesc(this.plugin.settings.version_settings);

        new Setting(containerEl)
            .setName("Power Obsidian Journaling (POJO) provider")
            .setHeading()
            .addExtraButton(button => button
                .setIcon("search")
                .setTooltip("Immediately scan all .md files currently in your vault to update POJO history.")
                .onClick(() => {
                    new ConfirmationModal(this.plugin.app,
                        "Start scanning?",
                        "Depending on the size of your vault and computer, this may take a while.",
                        button => button
                            .setButtonText("Scan")
                            .setCta(),
                        async () => {
                            await Pojo.scanFiles(this.plugin.settings, this.plugin.app.vault.getMarkdownFiles(), this.plugin.app.vault);
                        },
                    ).open();
                }))
            .addExtraButton(button => button
                .setIcon("trash")
                .setTooltip("Delete existing POJO history.")
                .onClick(async () => {
                    new ConfirmationModal(this.plugin.app,
                        "Delete POJO history?",
                        "This will delete the existing history of found POJO tags and POJO headings.",
                        button => button
                            .setButtonText("Delete")
                            .setWarning(),
                        async () => {
                            await Pojo.deleteHistoryProvider(this.plugin.app.vault);
                        },
                    ).open();
                }));

        this.createEnabledSetting("pojoProviderEnabled", "Whether or not the Power Obsidian Journaling provider is enabled", containerEl);
    }

    private createEnabledSetting (propertyName: keyof PojoSettings, desc: string, container: HTMLElement) {
        new Setting(container)
            .setName("Enabled")
            .setDesc(desc)
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings[propertyName] as boolean)
                //@ts-ignore
                .onChange(async (val) => {
                    // @ts-ignore
                    this.plugin.settings[propertyName] = val;
                    await this.plugin.saveSettings();
                }));
    }
}

class ConfirmationModal extends Modal {

    constructor(app: App, title: string, body: string, buttonCallback: (button: ButtonComponent) => void, clickCallback: () => Promise<void>) {
        super(app);
        this.titleEl.setText(title);
        this.contentEl.setText(body);
        new Setting(this.modalEl)
            .addButton(button => {
                buttonCallback(button);
                button.onClick(async () => {
                    await clickCallback();
                    this.close();
                })
            })
            .addButton(button => button
                .setButtonText("Cancel")
                .onClick(() => this.close())).settingEl.addClass("completr-settings-no-border");
    }
}
