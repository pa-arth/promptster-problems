// Regression tests for OR conditions being silently converted to AND
// in BuildCondition. Multi-expression OrConditions must not be flattened
// into AndConditions — only single-expression OR clauses should simplify.
package gorm

import (
	"testing"

	"gorm.io/gorm/clause"
)

func TestOrConditionsPreserved(t *testing.T) {
	// Create an inner *DB whose WHERE clause contains OR conditions
	// with multiple expressions. BuildCondition should preserve them as OR.
	inner := &DB{
		Statement: &Statement{
			Clauses: map[string]clause.Clause{
				"WHERE": {
					Expression: clause.Where{
						Exprs: []clause.Expression{
							clause.OrConditions{
								Exprs: []clause.Expression{
									clause.Expr{SQL: "role = ?", Vars: []interface{}{"admin"}},
									clause.Expr{SQL: "role = ?", Vars: []interface{}{"super_admin"}},
								},
							},
						},
					},
				},
			},
		},
	}

	// BuildCondition extracts WHERE expressions from sub-query *DB args
	stmt := &Statement{}
	exprs := stmt.BuildCondition(inner)

	if len(exprs) != 1 {
		t.Fatalf("expected 1 expression, got %d", len(exprs))
	}

	// The expression should still be OrConditions, not AndConditions
	switch exprs[0].(type) {
	case clause.OrConditions:
		// correct — OR was preserved
	case clause.AndConditions:
		t.Fatal("BUG: OrConditions with multiple expressions was silently converted to AndConditions")
	default:
		t.Fatalf("unexpected expression type: %T", exprs[0])
	}
}

func TestOrConditionsSingleExprCanSimplify(t *testing.T) {
	// A single-expression OrConditions CAN be simplified to AndConditions
	// because OR(x) == AND(x) semantically. This tests the fix doesn't
	// break the valid simplification case.
	inner := &DB{
		Statement: &Statement{
			Clauses: map[string]clause.Clause{
				"WHERE": {
					Expression: clause.Where{
						Exprs: []clause.Expression{
							clause.OrConditions{
								Exprs: []clause.Expression{
									clause.Expr{SQL: "active = ?", Vars: []interface{}{true}},
								},
							},
						},
					},
				},
			},
		},
	}

	stmt := &Statement{}
	exprs := stmt.BuildCondition(inner)

	if len(exprs) != 1 {
		t.Fatalf("expected 1 expression, got %d", len(exprs))
	}

	// Single-expression OR can be either OrConditions or AndConditions — both are fine
	switch exprs[0].(type) {
	case clause.OrConditions, clause.AndConditions:
		// both acceptable for single expression
	default:
		t.Fatalf("unexpected expression type: %T", exprs[0])
	}
}
