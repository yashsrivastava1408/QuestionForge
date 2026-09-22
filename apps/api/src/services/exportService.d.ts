interface PaperWithQuestions {
    title: string;
    organization: {
        name: string;
    };
    questions: {
        order: number;
        question: any;
    }[];
    id: string;
}
export declare function exportToJson(paper: PaperWithQuestions): string;
export declare function exportToPdf(paper: PaperWithQuestions, format: 'PDF_CANDIDATE' | 'PDF_INTERNAL', watermarkText: string): Promise<Buffer>;
export {};
//# sourceMappingURL=exportService.d.ts.map