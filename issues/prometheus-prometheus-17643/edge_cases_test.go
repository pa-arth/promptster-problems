// Edge cases for PR #17643: boundary conditions around the ignoring()/on()
// serialization fix. Covers empty on() symmetry, multi-label combinations,
// nested binary expressions, and the other binary operators (and/or/unless).
package parser

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestIgnoringEdgeCases(t *testing.T) {
	tests := []struct {
		name string
		in   string
		out  string
	}{
		// ─── Symmetry with on() — the fix preserves both ignoring() AND on() ───
		{
			name: "empty on with group_left is preserved",
			in:   `a * on() group_left c`,
			out:  `a * on () group_left () c`,
		},
		{
			name: "empty on with group_right(__metric__) is preserved",
			in:   `a * on() group_right(__metric__) c`,
			out:  `a * on () group_right (__metric__) c`,
		},

		// ─── Multi-label combinations stress the join logic ───
		{
			name: "ignoring with multiple labels and group_left with multiple group labels",
			in:   `a * ignoring(x, y, z) group_left(p, q) c`,
			out:  `a * ignoring (x, y, z) group_left (p, q) c`,
		},

		// ─── Set operators (and / or / unless) also take matching modifiers ───
		{
			name: "empty ignoring with 'and' set operator has no group modifier to preserve",
			// 'and' does not take group_x(), so empty ignoring() should still strip.
			in:  `a and ignoring() c`,
			out: `a and c`,
		},

		// ─── Nested binary expressions keep the preserved modifier through parent printing ───
		{
			name: "nested: outer + passes through inner ignoring() group_left",
			in:   `(a * ignoring() group_left(__metric__) b) + d`,
			out:  `(a * ignoring () group_left (__metric__) b) + d`,
		},
		{
			name: "two sibling binaries both preserve their empty ignoring()",
			in:   `a * ignoring() group_left c + d * ignoring() group_right(x) e`,
			out:  `a * ignoring () group_left () c + d * ignoring () group_right (x) e`,
		},

		// ─── Grammar constraint: group_left without ignoring/on is a parse error ───
		{
			name: "group_left without ignoring/on fails to parse (grammar guard)",
			in:   `a - group_left(__metric__) c`,
			out:  "", // sentinel: we assert the parse error instead of a round-trip
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			expr, err := ParseExpr(tt.in)
			if tt.out == "" {
				// Grammar guard: input should not parse.
				require.Error(t, err, "expected parse error for %q", tt.in)
				return
			}
			require.NoError(t, err, "parse %q", tt.in)
			require.Equal(t, tt.out, expr.String())
		})
	}
}
