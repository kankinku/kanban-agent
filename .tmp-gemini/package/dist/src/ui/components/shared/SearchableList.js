import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import { TextInput } from './TextInput.js';
import { useKeypress } from '../../hooks/useKeypress.js';
import { keyMatchers, Command } from '../../keyMatchers.js';
import { useFuzzyList, } from '../../hooks/useFuzzyList.js';
/**
 * A generic searchable list component.
 */
export function SearchableList({ title, items, onSelect, onClose, initialSearchQuery = '', searchPlaceholder = 'Search...', maxItemsToShow = 10, }) {
    const { filteredItems, searchBuffer, maxLabelWidth } = useFuzzyList({
        items,
        initialQuery: initialSearchQuery,
    });
    const [activeIndex, setActiveIndex] = useState(0);
    const [scrollOffset, setScrollOffset] = useState(0);
    // Reset selection when filtered items change
    useEffect(() => {
        setActiveIndex(0);
        setScrollOffset(0);
    }, [filteredItems]);
    // Calculate visible items
    const visibleItems = filteredItems.slice(scrollOffset, scrollOffset + maxItemsToShow);
    const showScrollUp = scrollOffset > 0;
    const showScrollDown = scrollOffset + maxItemsToShow < filteredItems.length;
    useKeypress((key) => {
        // Navigation
        if (keyMatchers[Command.DIALOG_NAVIGATION_UP](key)) {
            const newIndex = activeIndex > 0 ? activeIndex - 1 : filteredItems.length - 1;
            setActiveIndex(newIndex);
            if (newIndex === filteredItems.length - 1) {
                setScrollOffset(Math.max(0, filteredItems.length - maxItemsToShow));
            }
            else if (newIndex < scrollOffset) {
                setScrollOffset(newIndex);
            }
            return;
        }
        if (keyMatchers[Command.DIALOG_NAVIGATION_DOWN](key)) {
            const newIndex = activeIndex < filteredItems.length - 1 ? activeIndex + 1 : 0;
            setActiveIndex(newIndex);
            if (newIndex === 0) {
                setScrollOffset(0);
            }
            else if (newIndex >= scrollOffset + maxItemsToShow) {
                setScrollOffset(newIndex - maxItemsToShow + 1);
            }
            return;
        }
        // Selection
        if (keyMatchers[Command.RETURN](key)) {
            const item = filteredItems[activeIndex];
            if (item) {
                onSelect(item);
            }
            return;
        }
        // Close
        if (keyMatchers[Command.ESCAPE](key)) {
            onClose?.();
            return;
        }
    }, { isActive: true });
    return (_jsxs(Box, { borderStyle: "round", borderColor: theme.border.default, flexDirection: "column", padding: 1, width: "100%", children: [title && (_jsx(Box, { marginBottom: 1, children: _jsx(Text, { bold: true, children: title }) })), searchBuffer && (_jsx(Box, { borderStyle: "round", borderColor: theme.border.focused, paddingX: 1, marginBottom: 1, children: _jsx(TextInput, { buffer: searchBuffer, placeholder: searchPlaceholder, focus: true }) })), _jsx(Box, { flexDirection: "column", children: visibleItems.length === 0 ? (_jsx(Text, { color: theme.text.secondary, children: "No items found." })) : (visibleItems.map((item, idx) => {
                    const index = scrollOffset + idx;
                    const isActive = index === activeIndex;
                    return (_jsxs(Box, { flexDirection: "row", children: [_jsx(Text, { color: isActive ? theme.status.success : theme.text.secondary, children: isActive ? '> ' : '  ' }), _jsx(Box, { width: maxLabelWidth + 2, children: _jsx(Text, { color: isActive ? theme.status.success : theme.text.primary, children: item.label }) }), item.description && (_jsx(Text, { color: theme.text.secondary, children: item.description }))] }, item.key));
                })) }), (showScrollUp || showScrollDown) && (_jsx(Box, { marginTop: 1, justifyContent: "center", children: _jsxs(Text, { color: theme.text.secondary, children: [showScrollUp ? '▲ ' : '  ', filteredItems.length, " items", showScrollDown ? ' ▼' : '  '] }) }))] }));
}
//# sourceMappingURL=SearchableList.js.map