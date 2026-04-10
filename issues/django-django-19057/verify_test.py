"""
Regression tests for custom lookups combined with Subquery annotations.
Ensures lhs_params and rhs_params concatenation works regardless of
whether expressions return list or tuple params.
"""
from django.db import models
from django.db.models import Subquery, Value
from django.db.models.functions import Lower
from django.test import TestCase
from django.test.utils import register_lookup

from .models import Author


class NotEqual(models.Lookup):
    """Custom lookup that concatenates lhs_params + rhs_params directly."""
    lookup_name = "ne"

    def as_sql(self, compiler, connection):
        lhs, lhs_params = self.process_lhs(compiler, connection)
        rhs, rhs_params = self.process_rhs(compiler, connection)
        # This is the "simple" way — fails when one side returns a tuple
        # and the other returns a list (the bug).
        params = lhs_params + rhs_params
        return "%s <> %s" % (lhs, rhs), params


class GreaterThanLookup(models.Lookup):
    """Another custom lookup that triggers the same tuple/list mismatch."""
    lookup_name = "gt_custom"

    def as_sql(self, compiler, connection):
        lhs, lhs_params = self.process_lhs(compiler, connection)
        rhs, rhs_params = self.process_rhs(compiler, connection)
        params = lhs_params + rhs_params
        return "%s > %s" % (lhs, rhs), params


class LookupSubqueryTests(TestCase):
    def test_custom_lookup_with_subquery(self):
        """Custom lookup + Subquery annotation crashes with TypeError."""
        author = Author.objects.create(name="Isabella")

        with register_lookup(models.Field, NotEqual):
            qs = Author.objects.annotate(
                unknown_age=Subquery(
                    Author.objects.filter(age__isnull=True)
                    .order_by("name")
                    .values("name")[:1]
                )
            ).filter(unknown_age__ne="Plato")
            self.assertSequenceEqual(qs, [author])

    def test_second_custom_lookup_with_subquery(self):
        """A different custom lookup also crashes with the same TypeError."""
        Author.objects.create(name="Alice", age=30)
        Author.objects.create(name="Bob", age=25)

        with register_lookup(models.Field, GreaterThanLookup):
            qs = Author.objects.annotate(
                max_age=Subquery(
                    Author.objects.order_by("-age").values("age")[:1]
                )
            ).filter(max_age__gt_custom=Value(20))
            # Should return both authors (max_age=30 > 20), not crash
            self.assertEqual(qs.count(), 2)
