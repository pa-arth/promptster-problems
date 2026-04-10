// Regression tests for the PromQL printer dropping empty ignoring()
// when group modifiers (group_left/group_right) are present.
// Empty ignoring() with a group modifier affects whether metric names
// appear in results, so it must be preserved.
package parser

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestIgnoringPreservedWithGroupModifier(t *testing.T) {
	tests := []struct {
		name string
		in   string
		out  string
	}{
		{
			name: "empty ignoring with group_left and labels is preserved",
			in:   `a - ignoring() group_left(__metric__) c`,
			out:  `a - ignoring () group_left (__metric__) c`,
		},
		{
			name: "empty ignoring with group_left no labels is preserved",
			in:   `a - ignoring() group_left c`,
			out:  `a - ignoring () group_left () c`,
		},
		{
			name: "empty ignoring with group_right is preserved",
			in:   `a + ignoring() group_right() c`,
			out:  `a + ignoring () group_right () c`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			expr, err := ParseExpr(tt.in)
			require.NoError(t, err)
			require.Equal(t, tt.out, expr.String())
		})
	}
}
