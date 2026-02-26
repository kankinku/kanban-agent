/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type TextBuffer } from '../components/shared/text-buffer.js';
export interface GenericListItem {
    key: string;
    label: string;
    description?: string;
    scopeMessage?: string;
}
export interface UseFuzzyListProps<T extends GenericListItem> {
    items: T[];
    initialQuery?: string;
    onSearch?: (query: string) => void;
}
export interface UseFuzzyListResult<T extends GenericListItem> {
    filteredItems: T[];
    searchBuffer: TextBuffer | undefined;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    maxLabelWidth: number;
}
export declare function useFuzzyList<T extends GenericListItem>({ items, initialQuery, onSearch, }: UseFuzzyListProps<T>): UseFuzzyListResult<T>;
