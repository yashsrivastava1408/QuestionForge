import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const mockFetchQuestion = vi.fn();
const mockFetchByCategory = vi.fn();
const mockCreate = vi.fn();

vi.mock('@question-forge/ingestion', () => ({
  LeetCodeAdapter: vi.fn().mockImplementation(() => ({
    fetchQuestion: mockFetchQuestion,
    fetchByCategory: mockFetchByCategory,
  })),
  GFGAdapter: vi.fn().mockImplementation(() => ({
    fetchQuestion: mockFetchQuestion,
  })),
}));

vi.mock('../utils/prisma.js', () => ({
  prisma: { question: { create: mockCreate } },
}));

const { IngestionController } = await import('../controllers/ingestionController.js');

function mockRes(): Response {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

const SAMPLE_QUESTION = {
  title: 'Two Sum',
  statement: 'Given an array...',
  difficulty: 'EASY',
  type: 'DSA',
  topic: 'Array',
  tags: ['Array'],
  sourceUrl: 'https://leetcode.com/problems/two-sum/',
  sourcePlatform: 'leetcode',
  languages: ['python', 'java', 'cpp', 'javascript'],
};

describe('IngestionController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchOne', () => {
    it('previews without saving when save is false/omitted', async () => {
      mockFetchQuestion.mockResolvedValue(SAMPLE_QUESTION);
      const req = { body: { platform: 'leetcode', slug: 'two-sum' }, user: { organizationId: 'org-1' } } as unknown as Request;
      const res = mockRes();
      const next = vi.fn() as NextFunction;

      await IngestionController.fetchOne(req, res, next);

      expect(mockFetchQuestion).toHaveBeenCalledWith('two-sum');
      expect(mockCreate).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, saved: false, question: SAMPLE_QUESTION })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('persists a DRAFT question scoped to the caller org when save is true', async () => {
      mockFetchQuestion.mockResolvedValue(SAMPLE_QUESTION);
      mockCreate.mockResolvedValue({ id: 'q-1', ...SAMPLE_QUESTION, status: 'DRAFT', organizationId: 'org-1' });
      const req = {
        body: { platform: 'leetcode', slug: 'two-sum', save: true },
        user: { organizationId: 'org-1' },
      } as unknown as Request;
      const res = mockRes();
      const next = vi.fn() as NextFunction;

      await IngestionController.fetchOne(req, res, next);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Two Sum',
            status: 'DRAFT',
            organizationId: 'org-1',
            sourcePlatform: 'leetcode',
          }),
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('forwards a 404 AppError to next() when the adapter finds nothing', async () => {
      mockFetchQuestion.mockResolvedValue(null);
      const req = { body: { platform: 'leetcode', slug: 'does-not-exist' }, user: { organizationId: 'org-1' } } as unknown as Request;
      const res = mockRes();
      const next = vi.fn() as NextFunction;

      await IngestionController.fetchOne(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
      expect(res.json).not.toHaveBeenCalled();
    });

    it('rejects an invalid platform via next() instead of throwing synchronously', async () => {
      const req = { body: { platform: 'bogus', slug: 'x' }, user: { organizationId: 'org-1' } } as unknown as Request;
      const res = mockRes();
      const next = vi.fn() as NextFunction;

      await IngestionController.fetchOne(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockFetchQuestion).not.toHaveBeenCalled();
    });
  });

  describe('fetchByCategory', () => {
    it('previews a batch of ingested questions without saving', async () => {
      mockFetchByCategory.mockResolvedValue([SAMPLE_QUESTION, SAMPLE_QUESTION]);
      const req = {
        body: { platform: 'leetcode', category: 'array', limit: 2 },
        user: { organizationId: 'org-1' },
      } as unknown as Request;
      const res = mockRes();
      const next = vi.fn() as NextFunction;

      await IngestionController.fetchByCategory(req, res, next);

      expect(mockFetchByCategory).toHaveBeenCalledWith('array', 2);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, saved: false, count: 2 }));
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('persists every ingested question as a DRAFT when save is true', async () => {
      mockFetchByCategory.mockResolvedValue([SAMPLE_QUESTION, SAMPLE_QUESTION]);
      mockCreate.mockImplementation(({ data }: any) => Promise.resolve({ id: 'q-x', ...data }));
      const req = {
        body: { platform: 'leetcode', category: 'array', save: true },
        user: { organizationId: 'org-1' },
      } as unknown as Request;
      const res = mockRes();
      const next = vi.fn() as NextFunction;

      await IngestionController.fetchByCategory(req, res, next);

      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });
});
