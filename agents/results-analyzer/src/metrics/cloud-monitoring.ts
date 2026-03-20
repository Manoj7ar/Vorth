import "dotenv-safe/config.js";

import { MetricServiceClient } from "@google-cloud/monitoring";

const client = new MetricServiceClient();

export async function readCloudMonitoringMetrics(projectId: string, service: string) {
  if (!projectId || projectId === "optional-fill-for-gke") {
    return [];
  }

  const projectName = client.projectPath(projectId);
  const [timeSeries] = await client.listTimeSeries({
    name: projectName,
    filter: `metric.type = "kubernetes.io/container/cpu/core_usage_time" AND resource.labels.container_name = "${service}"`,
    interval: {
      endTime: {
        seconds: Math.floor(Date.now() / 1000),
      },
      startTime: {
        seconds: Math.floor(Date.now() / 1000) - 900,
      },
    },
    view: "FULL",
  });

  return timeSeries;
}
