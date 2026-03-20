resource "google_monitoring_dashboard" "vorth_overview" {
  dashboard_json = jsonencode({
    displayName = "Vorth Resilience Overview"
    mosaicLayout = {
      columns = 12
      tiles = [
        {
          width  = 12
          height = 4
          widget = {
            title = "Cluster CPU Usage"
            xyChart = {
              dataSets = [
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "metric.type=\"kubernetes.io/container/cpu/core_usage_time\""
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    }
  })
}
