resource "google_container_cluster" "vorth" {
  name     = "vorth-chaos-cluster"
  location = var.zone

  deletion_protection = false
  initial_node_count  = 1

  node_config {
    machine_type = "e2-standard-4"
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
    ]
  }
}
