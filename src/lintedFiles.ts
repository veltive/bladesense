import * as vscode from 'vscode';

interface LintedFile {
    fileName: string;
    lastLinted: number;
    lastModified: number;
}

export class LintedFiles {
    private static lintedFiles: Map<string, LintedFile> = new Map();
    private static lastAnalyzedFile: string | null = null;
    private static lastAnalyzedTime: number = 0;
    private static outputChannel: vscode.OutputChannel;

    public static initialize(outputChannel: vscode.OutputChannel): void {
        this.outputChannel = outputChannel;
    }

    public static shouldSkipAnalysis(fileName: string, currentTime: number, trigger: String | null): boolean {
        // Skip if this is the same file and was analyzed less than 3 seconds ago
        if (this.lastAnalyzedFile === fileName && currentTime - this.lastAnalyzedTime < 3000) {
            return true;
        }

        // Check if file was already linted and hasn't been modified since
        const lintedFile = this.lintedFiles.get(fileName);

        if (lintedFile && trigger === 'Changed active editor') {
            // Only skip if the file hasn't been modified since last lint
            if (lintedFile.lastModified <= lintedFile.lastLinted) {
                return true;
            }
        }

        return false;
    }

    public static updateTracking(fileName: string, currentTime: number, isDirty: boolean): void {
        // Update tracking variables
        this.lastAnalyzedFile = fileName;
        this.lastAnalyzedTime = currentTime;

        // Update or create linted file entry
        const lintedFile = this.lintedFiles.get(fileName);

        // If the file is dirty, update the last modified time
        this.lintedFiles.set(fileName, {
            fileName,
            lastLinted: currentTime,
            lastModified: isDirty ? currentTime : (lintedFile?.lastModified || 0)
        });
    }

    public static markFileAsModified(fileName: string): void {
        const lintedFile = this.lintedFiles.get(fileName);

        if (lintedFile) {
            lintedFile.lastModified = Date.now();
            this.lintedFiles.set(fileName, lintedFile);
        }
    }
}