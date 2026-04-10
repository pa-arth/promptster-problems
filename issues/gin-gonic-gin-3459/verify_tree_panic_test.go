// Regression tests for router tree panic when HandleMethodNotAllowed is
// enabled with overlapping parameterized routes. The skippedNodes
// backtracking loop must correctly decrement after shrinking the slice.
package gin

import (
	"net/http"
	"testing"
)

func TestRouterTreePanicMethodNotAllowed(t *testing.T) {
	r := New()
	r.HandleMethodNotAllowed = true

	handler := func(c *Context) { c.String(http.StatusOK, "ok") }

	// Register overlapping parameterized routes across methods.
	// The DELETE route forces HandleMethodNotAllowed to search
	// the DELETE tree for GET requests, exercising skippedNodes.
	base := r.Group("base")
	base.GET("/metrics", handler)

	v1 := base.Group("v1")
	v1.GET("/:id/devices", handler)
	v1.GET("/user/:id/groups", handler)
	v1.GET("/organizations/:id", handler)
	v1.DELETE("/organizations/:id", handler)

	// This request is ambiguous — the tree walker tries /:id/devices
	// with :id=user, fails on "groups" != "devices", backtracks via
	// skippedNodes. The off-by-one in the backtracking loop causes a
	// panic: runtime error: index out of range.
	w := PerformRequest(r, "GET", "/base/v1/user/groups")

	// Should not panic — just return 404 (no matching route)
	if w.Code != http.StatusNotFound && w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 404 or 405, got %d", w.Code)
	}
}

func TestRouterTreePanicDeepNesting(t *testing.T) {
	r := New()
	r.HandleMethodNotAllowed = true

	handler := func(c *Context) { c.String(http.StatusOK, "ok") }

	// Deeper nesting to exercise multiple skipped nodes
	r.GET("/api/v1/:resource/:id/details", handler)
	r.GET("/api/v1/users/:id/profile", handler)
	r.GET("/api/v1/users/:id/settings", handler)
	r.PUT("/api/v1/users/:id/profile", handler)

	// Request that doesn't match any route but triggers backtracking
	w := PerformRequest(r, "GET", "/api/v1/users/unknown")

	if w.Code != http.StatusNotFound && w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 404 or 405, got %d", w.Code)
	}
}
