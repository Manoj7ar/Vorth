resource "google_storage_bucket" "vorth_artifacts" {
  name                        = "${var.project_id}-vorth-artifacts"
  location                    = var.region
  uniform_bucket_level_access = true

  lifecycle_rule {
    action {
      type = "Delete"
    }

    condition {
      age = 30
    }
  }
}
