{{- define "spilo.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "spilo.fullname" -}}
{{- printf "%s" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "spilo.labels" -}}
application: spilo
spilo-cluster: {{ include "spilo.fullname" . }}
{{- end -}}