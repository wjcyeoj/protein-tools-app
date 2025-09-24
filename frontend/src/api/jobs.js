import client from './client';

export async function health() {
  const { data } = await client.get('/health');
  return data;
}

export async function submitJob({ tool, file, options = {} }) {
  const form = new FormData();
  form.append('tool', tool);
  form.append('file', file);

  // AlphaFold
  if (options.model_preset) form.append('model_preset', options.model_preset);
  if (options.db_preset) form.append('db_preset', options.db_preset);
  if (options.max_template_date) form.append('max_template_date', options.max_template_date);

  // ProteinMPNN
  if (options.mpnn_model_name) form.append('mpnn_model_name', options.mpnn_model_name);
  if (options.mpnn_num_seq) form.append('mpnn_num_seq', String(options.mpnn_num_seq));
  if (options.mpnn_batch_size) form.append('mpnn_batch_size', String(options.mpnn_batch_size));
  if (options.mpnn_sampling_temp) form.append('mpnn_sampling_temp', String(options.mpnn_sampling_temp));
  if (options.mpnn_freeze_spec) form.append('mpnn_freeze_spec', options.mpnn_freeze_spec);

  const { data } = await client.post('/jobs', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data; // { job_id, status }
}

export async function getJob(id) {
  const { data } = await client.get(`/jobs/${id}`);
  return data;
}

export async function getJobLogs(id, tail = 400) {
  const { data } = await client.get(`/jobs/${id}/logs`, { params: { tail } });
  return data; // { log: "..." }
}

export function downloadUrl(id, mode = 'full') {
  return `${client.defaults.baseURL}/jobs/${id}/download?mode=${mode}`;
}
