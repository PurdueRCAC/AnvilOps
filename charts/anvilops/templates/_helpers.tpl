{{/*
Expand the name of the chart.
*/}}
{{- define "anvilops.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "anvilops.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "anvilops.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels (applied to all deployments)
*/}}
{{- define "anvilops.commonLabels" -}}
helm.sh/chart: {{ include "anvilops.chart" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Common selector labels (applied to all deployments)
*/}}
{{- define "anvilops.commonSelectorLabels" -}}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/* Helpers specific to the AnvilOps deployment */}}

{{/* Common labels applied to AnvilOps deployment */}}
{{- define "anvilops.labels" -}}
{{ include "anvilops.commonLabels" . }}
{{ include "anvilops.selectorLabels" . }}
{{- end }}

{{/* Common selector labels applied to AnvilOps deployment */}}
{{- define "anvilops.selectorLabels" -}}
{{ include "anvilops.commonSelectorLabels" . }}
app.kubernetes.io/name: {{ include "anvilops.name" . }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "anvilops.serviceAccountName" -}}
{{- if .Values.anvilops.serviceAccount.create }}
{{- default (include "anvilops.fullname" .) .Values.anvilops.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.anvilops.serviceAccount.name }}
{{- end }}
{{- end }}

{{/* Helpers specific to the buildkitd deployment */}}

{{/* Common labels applied to buildkitd deployment */}}
{{- define "anvilops.buildkitd.labels" -}}
{{ include "anvilops.commonLabels" . }}
{{ include "anvilops.buildkitd.selectorLabels" . }}
{{- end }}

{{/* Common selector labels applied to buildkitd deployment */}}
{{- define "anvilops.buildkitd.selectorLabels" -}}
{{ include "anvilops.commonSelectorLabels" . }}
app.kubernetes.io/name: {{ include "anvilops.name" . }}-buildkitd
{{- end }}

{{/* Helpers specific to the Postgres deployment */}}

{{/* Common labels applied to Postgres deployment */}}
{{- define "anvilops.postgres.labels" -}}
{{ include "anvilops.commonLabels" . }}
{{ include "anvilops.postgres.selectorLabels" . }}
{{- end }}

{{/* Common selector labels applied to Postgres deployment */}}
{{- define "anvilops.postgres.selectorLabels" -}}
{{ include "anvilops.commonSelectorLabels" . }}
app.kubernetes.io/name: {{ include "anvilops.name" . }}-postgres
{{- end }}
