import { useState, useCallback, useRef } from 'react';
import { ASSET_CLASSES, resolveTickerToAssetClass } from '../data/assetClasses';

interface CsvUploadProps {
    onParsed: (allocations: Record<string, number>) => void;
}

interface ParseError {
    line: number;
    text: string;
    error: string;
}

export function CsvUpload({ onParsed }: CsvUploadProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [errors, setErrors] = useState<ParseError[]>([]);
    const [fileName, setFileName] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const parseCSV = useCallback((text: string, name: string) => {
        setFileName(name);
        const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
        const errs: ParseError[] = [];
        const classWeights: Record<string, number> = {};

        // Initialize all to 0
        for (const ac of ASSET_CLASSES) classWeights[ac.id] = 0;

        // Detect header
        const firstLine = lines[0].toLowerCase();
        const startIdx = (firstLine.includes('ticker') || firstLine.includes('asset') || firstLine.includes('weight')) ? 1 : 0;

        for (let i = startIdx; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(/[,\t;]+/).map(s => s.trim());
            if (parts.length < 2) {
                errs.push({ line: i + 1, text: line, error: 'Expected "Ticker, Weight" or "AssetClass, Weight"' });
                continue;
            }

            const [nameOrTicker, weightStr] = parts;
            const weight = parseFloat(weightStr.replace('%', ''));

            if (isNaN(weight) || weight < 0) {
                errs.push({ line: i + 1, text: line, error: `Invalid weight: "${weightStr}"` });
                continue;
            }

            // Try to resolve as ticker first, then as asset class name
            let classId = resolveTickerToAssetClass(nameOrTicker);
            if (!classId) {
                // Try matching asset class name directly
                const match = ASSET_CLASSES.find(ac =>
                    ac.name.toLowerCase() === nameOrTicker.toLowerCase() ||
                    ac.id === nameOrTicker.toLowerCase()
                );
                classId = match?.id ?? null;
            }

            if (!classId) {
                errs.push({ line: i + 1, text: line, error: `Unknown ticker or asset class: "${nameOrTicker}"` });
                continue;
            }

            classWeights[classId] += weight;
        }

        setErrors(errs);

        // If we got any valid allocations, send them up
        const total = Object.values(classWeights).reduce((s, v) => s + v, 0);
        if (total > 0) {
            onParsed(Object.fromEntries(
                Object.entries(classWeights).map(([k, v]) => [k, Math.round(v)])
            ));
        }
    }, [onParsed]);

    const handleFile = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = () => parseCSV(reader.result as string, file.name);
        reader.readAsText(file);
    }, [parseCSV]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }, [handleFile]);

    return (
        <div className="csv-upload">
            <div
                className={`csv-dropzone ${isDragging ? 'csv-dragging' : ''}`}
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
            >
                <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.tsv,.txt"
                    style={{ display: 'none' }}
                    onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleFile(file);
                    }}
                />
                {fileName ? (
                    <span className="csv-filename">✓ {fileName}</span>
                ) : (
                    <>
                        <span className="csv-icon">📂</span>
                        <span>Drop a CSV here or click to browse</span>
                    </>
                )}
            </div>

            <div className="csv-hint">
                Format: <code>Ticker, Weight</code> — e.g. <code>SPY, 40</code> / <code>BND, 30</code> / <code>GLD, 10</code>
            </div>

            {errors.length > 0 && (
                <div className="csv-errors">
                    {errors.map((err, i) => (
                        <div key={i} className="csv-error-row">
                            <span className="csv-error-line">Line {err.line}:</span>
                            <span className="csv-error-msg">{err.error}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
