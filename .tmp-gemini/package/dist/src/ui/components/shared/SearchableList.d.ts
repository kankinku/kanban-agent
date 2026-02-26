/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from 'react';
import { type GenericListItem } from '../../hooks/useFuzzyList.js';
export interface SearchableListProps<T extends GenericListItem> {
    /** List title */
    title?: string;
    /** Available items */
    items: T[];
    /** Callback when an item is selected */
    onSelect: (item: T) => void;
    /** Callback when the list is closed (e.g. via Esc) */
    onClose?: () => void;
    /** Initial search query */
    initialSearchQuery?: string;
    /** Placeholder for search input */
    searchPlaceholder?: string;
    /** Max items to show at once */
    maxItemsToShow?: number;
}
/**
 * A generic searchable list component.
 */
export declare function SearchableList<T extends GenericListItem>({ title, items, onSelect, onClose, initialSearchQuery, searchPlaceholder, maxItemsToShow, }: SearchableListProps<T>): React.JSX.Element;
