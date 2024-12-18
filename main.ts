import { App, Notice, Plugin, Modal, DropdownComponent, TextComponent, ButtonComponent } from 'obsidian';

export default class TableStatsPlugin extends Plugin {
    onload() {
        this.addCommand({
            id: 'calculate-custom-table-stats',
            name: 'Calculate Custom Table Stats',
            callback: () => this.calculateStats(),
        });
        this.addRibbonIcon('activity', 'Calculate Table Stats', () => {
            this.calculateStats();
        });
    }

    async calculateStats() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('No active file.');
            return;
        }
        const fileContent = await this.app.vault.read(activeFile);
        const tables = fileContent.match(/(\|.*\|[\r\n|\r|\n]){2,}/gm);
        if (!tables || tables.length === 0) {
            new Notice('No markdown tables found.');
            return;
        }
        
        if (tables.length > 1) {
            new TableSelectModal(this.app, tables, (selectedTable) => {
                this.showColumnSelectModal(selectedTable);
            }).open();
        } else {
            this.showColumnSelectModal(tables[0]);
        }
    }
    
    showColumnSelectModal(table: string) {
        const rows = table.split('\n').filter(line => line.trim().startsWith('|') && !line.trim().startsWith('| ---'));
        if (rows.length <= 1) {
            new Notice('Table has no data rows.');
            return;
        }
        
        const columnCount = rows[0].split('|').length - 2;
        new ColumnSelectModal(this.app, columnCount, rows).open();
    }
}

class TableSelectModal extends Modal {
    constructor(app: App, private tables: string[], private onTableSelect: (table: string) => void) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', {text: 'Select Table for Stats Calculation'});

				const dropdownWrapper = contentEl.createDiv();
        dropdownWrapper.addClass('dropdown-wrapper');

        const tableDropdown = new DropdownComponent(dropdownWrapper);
        this.tables.forEach((table, index) => {
            const preview = table.split('\n')[0].substring(0, 50) + '...';
            tableDropdown.addOption(index.toString(), `Table ${index + 1}: ${preview}`);
        });

				const buttonWrapper = contentEl.createDiv();
        buttonWrapper.addClass('button-wrapper');

        const confirmButton = new ButtonComponent(buttonWrapper);
        confirmButton.setButtonText('Confirm').onClick(() => {
            const selectedTableIndex = parseInt(tableDropdown.getValue());
            const selectedTable = this.tables[selectedTableIndex];
            this.onTableSelect(selectedTable);
            this.close();
        });
    }
}

class ColumnSelectModal extends Modal {
    constructor(app: App, private columnCount: number, private rows: string[]) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', {text: 'Calculate Stats for Table Column'});

        const dropdownWrapper = contentEl.createDiv();
        dropdownWrapper.addClass('dropdown-wrapper');

        const dropdown = new DropdownComponent(dropdownWrapper);
        for (let i = 2; i <= this.columnCount; i++) {
            dropdown.addOption(i.toString(), `Column ${i}`);
        }

        const methodDropdown = new DropdownComponent(dropdownWrapper);
        methodDropdown.addOption('sum', 'Sum');
        methodDropdown.addOption('count', 'Count');
        methodDropdown.addOption('average', 'Average');

        const yamlFieldWrapper = contentEl.createDiv();
        yamlFieldWrapper.addClass('yaml-field-wrapper');

        const yamlFieldInput = new TextComponent(yamlFieldWrapper);
        yamlFieldInput.setPlaceholder("YAML Field (e.g., stats)");

        const buttonWrapper = contentEl.createDiv();
        buttonWrapper.addClass('button-wrapper');

        const calculateButton = new ButtonComponent(buttonWrapper);
        calculateButton.setButtonText('Calculate').onClick(() => {
            const columnIndex = parseInt(dropdown.getValue()) - 1;
            const methodName = methodDropdown.getValue();
            const yamlField = yamlFieldInput.getValue();
            const stats = this.calculateColumnStats(columnIndex, methodName);
            this.updateYamlField(yamlField, methodName, stats.result);
            this.close();
        });
    }

    calculateColumnStats(columnIndex: number, methodName: string): { result: number; count: number } {
        let sum = 0;
        let count = 0;
        this.rows.forEach((row, idx) => {
            if (idx === 0) return;
            const cells = row.split('|').slice(1, -1);
            const cellValue = parseFloat(cells[columnIndex]);
            if (!isNaN(cellValue)) {
                sum += cellValue;
                count += 1;
            }
        });

        let result = 0;
        switch (methodName) {
            case 'sum':
                result = sum;
                break;
            case 'count':
                result = count;
                break;
            case 'average':
                result = count > 0 ? sum / count : 0;
                break;
        }

        return { result, count };
    }

    async updateYamlField(field: string, method: string, value: number) {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return;
        
        let fileContent = await this.app.vault.read(activeFile);
        const yamlPattern = /---\n([\s\S]+?)\n---/g;
        let yamlMatch = yamlPattern.exec(fileContent);
        
        let newYamlContent;
        if (yamlMatch) {
            let yamlContent = yamlMatch[1];
            const fieldPattern = new RegExp(`(${field}:).*`, 'm');
            if (fieldPattern.test(yamlContent)) {
                yamlContent = yamlContent.replace(fieldPattern, `$1 ${value}`);
            } else {
                yamlContent += `\n${field}: ${value}`;
            }
            newYamlContent = `---\n${yamlContent}\n---`;
        } else {
            newYamlContent = `---\n${field}: ${value}\n---\n`;
        }

        fileContent = fileContent.replace(yamlMatch ? yamlMatch[0] : '', newYamlContent);
        await this.app.vault.modify(activeFile, fileContent);
        new Notice(`Updated YAML field ${field} with value: ${value}`);
    }
}