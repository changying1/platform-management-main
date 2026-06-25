package com.app.myapplication.ui.call;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.AppVoiceCallApi;
import com.app.myapplication.data.api.CallApi;
import com.app.myapplication.data.local.SessionManager;
import com.app.myapplication.data.model.call.AppVoiceParticipant;
import com.app.myapplication.data.model.call.AppVoiceRoom;
import com.app.myapplication.data.model.call.AppVoiceRoomCreateRequest;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class VoiceCallFragment extends Fragment {

    private TextView tvSelectedCount;
    private TextView tvSubtitle;
    private TextView tvCurrentIdentity;
    private EditText etContactSearch;
    private Button btnOrgFilter;
    private Button btnModeAppVoice;
    private Button btnModeJt808Message;
    private Button btnSwitchIdentity;
    private Button btnStartCall;
    private Button btnJt808Broadcast;
    private ProgressBar progressBar;
    private RecyclerView rvContacts;

    private final List<Contact> allContacts = new ArrayList<>();
    private final List<Contact> contacts = new ArrayList<>();
    private final List<Jt808Target> allJt808Targets = new ArrayList<>();
    private final List<Jt808Target> jt808Targets = new ArrayList<>();
    private final Set<String> selectedIds = new HashSet<>();
    private final Set<String> selectedJt808Phones = new HashSet<>();
    private String searchKeyword = "";
    private OrgFilter selectedOrgFilter = OrgFilter.all();
    private CommMode currentMode = CommMode.APP_VOICE;
    private ContactAdapter adapter;
    private ActivityResultLauncher<String> audioPermissionLauncher;
    private ActivityResultLauncher<Intent> speechInputLauncher;
    private EditText activeTtsInput;

    public static VoiceCallFragment newInstance() {
        return new VoiceCallFragment();
    }

    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        audioPermissionLauncher = registerForActivityResult(
                new ActivityResultContracts.RequestPermission(),
                granted -> {
                    if (granted) {
                        createVoiceRoom();
                    } else {
                        Toast.makeText(requireContext(), "需要麦克风权限才能语音通话", Toast.LENGTH_SHORT).show();
                    }
                }
        );
        speechInputLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                this::handleSpeechInputResult
        );
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_voice_call, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        tvSelectedCount = view.findViewById(R.id.tv_selected_count);
        tvSubtitle = view.findViewById(R.id.tv_subtitle);
        tvCurrentIdentity = view.findViewById(R.id.tv_current_identity);
        etContactSearch = view.findViewById(R.id.et_contact_search);
        btnOrgFilter = view.findViewById(R.id.btn_org_filter);
        btnModeAppVoice = view.findViewById(R.id.btn_mode_app_voice);
        btnModeJt808Message = view.findViewById(R.id.btn_mode_jt808_message);
        btnSwitchIdentity = view.findViewById(R.id.btn_switch_identity);
        btnStartCall = view.findViewById(R.id.btn_start_call);
        btnJt808Broadcast = view.findViewById(R.id.btn_jt808_broadcast);
        progressBar = view.findViewById(R.id.progress_bar);
        rvContacts = view.findViewById(R.id.rv_contacts);

        adapter = new ContactAdapter();
        rvContacts.setLayoutManager(new LinearLayoutManager(requireContext()));
        rvContacts.setAdapter(adapter);

        btnModeAppVoice.setOnClickListener(v -> switchMode(CommMode.APP_VOICE));
        btnModeJt808Message.setOnClickListener(v -> switchMode(CommMode.JT808_MESSAGE));
        btnStartCall.setOnClickListener(v -> handlePrimaryAction());
        if (btnJt808Broadcast != null) {
            btnJt808Broadcast.setVisibility(View.GONE);
            btnJt808Broadcast.setOnClickListener(v -> openJt808BroadcastTargetDialog());
        }
        btnSwitchIdentity.setVisibility(View.GONE);
        btnOrgFilter.setOnClickListener(v -> showOrgFilterDialog());
        etContactSearch.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                searchKeyword = s == null ? "" : s.toString().trim();
                if (currentMode == CommMode.APP_VOICE) {
                    applyContactFilter();
                } else {
                    applyJt808Filter();
                }
                updateSelectionState();
            }
            @Override public void afterTextChanged(Editable s) {}
        });

        loadContacts();
        loadJt808Targets();
        updateCurrentIdentity();
        updateModeUi();
        updateSelectionState();
    }

    private void loadContacts() {
        progressBar.setVisibility(View.VISIBLE);
        AppVoiceCallApi api = ApiClient.get(requireContext()).create(AppVoiceCallApi.class);
        api.getCallUsers().enqueue(new Callback<List<Map<String, Object>>>() {
            @Override
            public void onResponse(@NonNull Call<List<Map<String, Object>>> call, @NonNull Response<List<Map<String, Object>>> response) {
                progressBar.setVisibility(View.GONE);
                allContacts.clear();
                if (response.isSuccessful() && response.body() != null) {
                    for (Map<String, Object> item : response.body()) {
                        String id = valueOf(item.get("id"));
                        String name = valueOf(firstNonEmpty(item.get("username"), item.get("name")));
                        String dept = valueOf(firstNonEmpty(item.get("dept"), item.get("company")));
                        String role = valueOf(firstNonEmpty(item.get("role"), item.get("workType")));
                        String company = valueOf(firstNonEmpty(firstNonEmpty(item.get("branch_name"), item.get("branchName")), firstNonEmpty(item.get("company"), item.get("dept"))));
                        String project = valueOf(firstNonEmpty(firstNonEmpty(item.get("project_name"), item.get("projectName")), item.get("project")));
                        String grid = valueOf(firstNonEmpty(firstNonEmpty(item.get("grid_name"), item.get("gridName")), item.get("grid")));
                        String team = valueOf(firstNonEmpty(firstNonEmpty(item.get("team_name"), item.get("teamName")), item.get("team")));
                        if (!TextUtils.isEmpty(id) && !TextUtils.isEmpty(name)) {
                            allContacts.add(new Contact(id, name, dept, role, company, project, grid, team));
                        }
                    }
                }
                if (allContacts.size() < 2) {
                    addFallbackContacts();
                }
                applyContactFilter();
                updateSelectionState();
            }

            @Override
            public void onFailure(@NonNull Call<List<Map<String, Object>>> call, @NonNull Throwable t) {
                progressBar.setVisibility(View.GONE);
                allContacts.clear();
                addFallbackContacts();
                applyContactFilter();
                updateSelectionState();
                Toast.makeText(requireContext(), "人员加载失败，已使用示例联系人", Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void loadJt808Targets() {
        CallApi api = ApiClient.get(requireContext()).create(CallApi.class);
        api.getJT808Devices(0, 1000).enqueue(new Callback<List<Map<String, Object>>>() {
            @Override
            public void onResponse(@NonNull Call<List<Map<String, Object>>> call, @NonNull Response<List<Map<String, Object>>> response) {
                allJt808Targets.clear();
                if (response.isSuccessful()) {
                    allJt808Targets.addAll(parseJt808Targets(response.body()));
                }
                applyJt808Filter();
                updateSelectionState();
            }

            @Override
            public void onFailure(@NonNull Call<List<Map<String, Object>>> call, @NonNull Throwable t) {
                allJt808Targets.clear();
                applyJt808Filter();
                updateSelectionState();
            }
        });
    }

    private Object firstNonEmpty(Object first, Object second) {
        if (first != null && !TextUtils.isEmpty(first.toString())) {
            return first;
        }
        return second;
    }

    private String valueOf(Object value) {
        return value == null ? "" : value.toString();
    }

    private void addFallbackContacts() {
        addFallbackContact("worker_1001", "张三", "安全巡检组", "安全员");
        addFallbackContact("worker_1002", "李四", "隧道施工组", "班组长");
        addFallbackContact("worker_1003", "王五", "机电维护组", "维修员");
        addFallbackContact("worker_1004", "赵六", "项目管理部", "现场负责人");
    }

    private void addFallbackContact(String id, String name, String dept, String role) {
        for (Contact contact : allContacts) {
            if (TextUtils.equals(contact.id, id) || TextUtils.equals(contact.name, name)) {
                return;
            }
        }
        allContacts.add(new Contact(id, name, dept, role, dept, "", "", ""));
    }

    private void applyContactFilter() {
        SessionManager session = new SessionManager(requireContext());
        String currentUserId = session.getUserId();
        contacts.clear();
        for (Contact contact : allContacts) {
            if (!TextUtils.equals(contact.id, currentUserId)
                    && matchesSearch(contact)
                    && selectedOrgFilter.matches(contact)) {
                contacts.add(contact);
            }
        }
        selectedIds.remove(currentUserId);
        adapter.notifyDataSetChanged();
    }

    private void applyJt808Filter() {
        jt808Targets.clear();
        for (Jt808Target target : allJt808Targets) {
            if (matchesSearch(target)) {
                jt808Targets.add(target);
            }
        }
        adapter.notifyDataSetChanged();
    }

    private boolean matchesSearch(Contact contact) {
        if (TextUtils.isEmpty(searchKeyword)) return true;
        return contact.searchText().toLowerCase(Locale.ROOT)
                .contains(searchKeyword.toLowerCase(Locale.ROOT));
    }

    private boolean matchesSearch(Jt808Target target) {
        if (TextUtils.isEmpty(searchKeyword)) return true;
        String text = TextUtils.join(" ", new String[]{target.phone, target.name, target.status});
        return text.toLowerCase(Locale.ROOT)
                .contains(searchKeyword.toLowerCase(Locale.ROOT));
    }

    private void showOrgFilterDialog() {
        OrgNode root = buildOrgTree();
        RecyclerView treeView = new RecyclerView(requireContext());
        treeView.setLayoutManager(new LinearLayoutManager(requireContext()));
        treeView.setPadding(0, dp(6), 0, dp(6));

        final AlertDialog[] holder = new AlertDialog[1];
        OrgTreeAdapter treeAdapter = new OrgTreeAdapter(root, node -> {
            selectedOrgFilter = node.filter;
            btnOrgFilter.setText("单位筛选：" + selectedOrgFilter.buttonText());
            applyContactFilter();
            updateSelectionState();
            if (holder[0] != null) holder[0].dismiss();
        });
        treeView.setAdapter(treeAdapter);

        holder[0] = new AlertDialog.Builder(requireContext())
                .setTitle("按单位树筛选")
                .setView(treeView)
                .setNegativeButton("取消", null)
                .create();
        holder[0].show();
    }

    private OrgNode buildOrgTree() {
        OrgNode root = new OrgNode("全部成员", OrgFilter.all(), 0);
        for (Contact contact : allContacts) {
            root.count++;
            OrgNode company = root.child(contact.company, new OrgFilter(1, contact.company, "", "", ""));
            if (company == null) continue;
            company.count++;
            OrgNode project = company.child(contact.project, new OrgFilter(2, contact.company, contact.project, "", ""));
            if (project == null) continue;
            project.count++;
            OrgNode grid = project.child(contact.grid, new OrgFilter(3, contact.company, contact.project, contact.grid, ""));
            if (grid == null) continue;
            grid.count++;
            OrgNode team = grid.child(contact.team, new OrgFilter(4, contact.company, contact.project, contact.grid, contact.team));
            if (team != null) team.count++;
        }
        return root;
    }

    private List<OrgFilter> buildOrgFilters() {
        List<OrgFilter> result = new ArrayList<>();
        result.add(OrgFilter.all());
        LinkedHashMap<String, OrgFilter> unique = new LinkedHashMap<>();
        for (Contact contact : allContacts) {
            addOrgOption(unique, new OrgFilter(1, contact.company, "", "", ""));
            addOrgOption(unique, new OrgFilter(2, contact.company, contact.project, "", ""));
            addOrgOption(unique, new OrgFilter(3, contact.company, contact.project, contact.grid, ""));
            addOrgOption(unique, new OrgFilter(4, contact.company, contact.project, contact.grid, contact.team));
        }
        result.addAll(unique.values());
        return result;
    }

    private void addOrgOption(LinkedHashMap<String, OrgFilter> map, OrgFilter filter) {
        if (filter == null || TextUtils.isEmpty(filter.currentValue())) return;
        map.put(filter.key(), filter);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void updateCurrentIdentity() {
        SessionManager session = new SessionManager(requireContext());
        String userId = session.getUserId();
        String nickname = session.getNickname();
        if (TextUtils.isEmpty(userId)) {
            tvCurrentIdentity.setText("当前身份：未选择");
            return;
        }
        String label = TextUtils.isEmpty(nickname) ? userId : nickname + " (" + userId + ")";
        tvCurrentIdentity.setText("当前身份：" + label);
    }

    private void switchMode(CommMode mode) {
        if (currentMode == mode) return;
        currentMode = mode;
        searchKeyword = "";
        etContactSearch.setText("");
        updateModeUi();
        if (currentMode == CommMode.APP_VOICE) {
            applyContactFilter();
        } else {
            applyJt808Filter();
        }
        updateSelectionState();
    }

    private void updateModeUi() {
        boolean appMode = currentMode == CommMode.APP_VOICE;
        btnModeAppVoice.setTextColor(android.graphics.Color.parseColor(appMode ? "#FFFFFF" : "#4F3A9B"));
        btnModeJt808Message.setTextColor(android.graphics.Color.parseColor(appMode ? "#4F3A9B" : "#FFFFFF"));
        btnModeAppVoice.setBackgroundColor(android.graphics.Color.parseColor(appMode ? "#6B52AE" : "#E9E3F7"));
        btnModeJt808Message.setBackgroundColor(android.graphics.Color.parseColor(appMode ? "#E9E3F7" : "#6B52AE"));
        btnSwitchIdentity.setVisibility(View.GONE);
        btnOrgFilter.setVisibility(appMode ? View.VISIBLE : View.GONE);
        etContactSearch.setHint(appMode ? "搜索成员、单位、项目、网格、工队" : "搜索定位工牌、设备号、手机号");
        tvSubtitle.setText(appMode ? "选择App成员后发起实时语音房间" : "选择定位工牌后发送文字播报消息");
        btnStartCall.setText(appMode ? "发起语音通话" : "发送工牌消息");
    }

    private void handlePrimaryAction() {
        if (currentMode == CommMode.APP_VOICE) {
            startCallWithPermission();
        } else {
            startJt808Message();
        }
    }

    private void startJt808Message() {
        List<Jt808Target> selected = selectedJt808Targets();
        if (selected.isEmpty()) {
            Toast.makeText(requireContext(), "请选择至少一个定位工牌", Toast.LENGTH_SHORT).show();
            return;
        }
        showJt808TextInputDialog(selected);
    }

    private void startCallWithPermission() {
        if (selectedIds.isEmpty()) {
            Toast.makeText(requireContext(), "请选择至少一名成员", Toast.LENGTH_SHORT).show();
            return;
        }
        if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED) {
            createVoiceRoom();
        } else {
            audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO);
        }
    }

    private void createVoiceRoom() {
        SessionManager session = new SessionManager(requireContext());
        String userId = session.getUserId();
        String nickname = session.getNickname();
        if (TextUtils.isEmpty(userId)) {
            Toast.makeText(requireContext(), "当前登录状态已失效，请重新登录", Toast.LENGTH_SHORT).show();
            return;
        }
        if (TextUtils.isEmpty(nickname)) {
            nickname = "我";
        }

        AppVoiceRoomCreateRequest request = new AppVoiceRoomCreateRequest();
        request.initiator = new AppVoiceParticipant(userId, nickname);
        request.title = String.format(Locale.getDefault(), "%d人语音通话", selectedIds.size() + 1);
        for (Contact contact : contacts) {
            if (selectedIds.contains(contact.id)) {
                request.members.add(new AppVoiceParticipant(contact.id, contact.name));
            }
        }

        setLoading(true);
        AppVoiceCallApi api = ApiClient.get(requireContext()).create(AppVoiceCallApi.class);
        api.createRoom(request).enqueue(new Callback<AppVoiceRoom>() {
            @Override
            public void onResponse(@NonNull Call<AppVoiceRoom> call, @NonNull Response<AppVoiceRoom> response) {
                setLoading(false);
                if (response.isSuccessful() && response.body() != null) {
                    Intent intent = new Intent(requireContext(), VoiceRoomActivity.class);
                    intent.putExtra(VoiceRoomActivity.EXTRA_ROOM_ID, response.body().roomId);
                    intent.putExtra(VoiceRoomActivity.EXTRA_USER_ID, request.initiator.userId);
                    intent.putExtra(VoiceRoomActivity.EXTRA_IS_INITIATOR, true);
                    startActivity(intent);
                } else {
                    Toast.makeText(requireContext(), "创建语音房间失败", Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onFailure(@NonNull Call<AppVoiceRoom> call, @NonNull Throwable t) {
                setLoading(false);
                Toast.makeText(requireContext(), "网络错误: " + t.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void openJt808BroadcastTargetDialog() {
        switchMode(CommMode.JT808_MESSAGE);
        if (allJt808Targets.isEmpty()) {
            loadJt808Targets();
        }
    }

    private List<Jt808Target> parseJt808Targets(@Nullable List<Map<String, Object>> rawItems) {
        List<Jt808Target> result = new ArrayList<>();
        if (rawItems == null) return result;
        Set<String> seenPhones = new HashSet<>();
        for (Map<String, Object> item : rawItems) {
            String phone = firstText(item,
                    "phone_num", "holderPhone", "holder_phone", "stream_url", "device_phone", "device_id", "id");
            String name = firstText(item, "name", "device_name", "deviceName", "device_code", "device_id", "id");
            String status = firstText(item, "status");
            if (TextUtils.isEmpty(phone)) continue;
            if (seenPhones.contains(phone)) continue;
            seenPhones.add(phone);
            result.add(new Jt808Target(phone, TextUtils.isEmpty(name) ? phone : name, status));
        }
        return result;
    }

    private String firstText(Map<String, Object> item, String... keys) {
        for (String key : keys) {
            Object value = item.get(key);
            if (value != null && !TextUtils.isEmpty(value.toString().trim())) {
                return value.toString().trim();
            }
        }
        return "";
    }

    private void showJt808TargetSelector(List<Jt808Target> targets) {
        String[] labels = new String[targets.size()];
        boolean[] checked = new boolean[targets.size()];
        for (int i = 0; i < targets.size(); i++) {
            Jt808Target target = targets.get(i);
            labels[i] = target.displayLabel();
            checked[i] = target.isOnline();
        }

        new AlertDialog.Builder(requireContext())
                .setTitle("选择JT808播报终端")
                .setMultiChoiceItems(labels, checked, (dialog, which, isChecked) -> checked[which] = isChecked)
                .setNegativeButton("取消", null)
                .setNeutralButton("清空", (dialog, which) -> showJt808TargetSelector(targets))
                .setPositiveButton("下一步", (dialog, which) -> {
                    List<Jt808Target> selected = new ArrayList<>();
                    for (int i = 0; i < targets.size(); i++) {
                        if (checked[i]) selected.add(targets.get(i));
                    }
                    if (selected.isEmpty()) {
                        Toast.makeText(requireContext(), "请至少选择一台JT808终端", Toast.LENGTH_SHORT).show();
                        return;
                    }
                    showJt808TextInputDialog(selected);
                })
                .show();
    }

    private void showJt808TextInputDialog(List<Jt808Target> targets) {
        showJt808TextInputDialog(targets, null);
    }

    private void showJt808TextInputDialog(List<Jt808Target> targets, @Nullable Runnable afterSent) {
        LinearLayout container = new LinearLayout(requireContext());
        container.setOrientation(LinearLayout.VERTICAL);
        int padding = dp(18);
        container.setPadding(padding, dp(10), padding, 0);

        TextView targetSummary = new TextView(requireContext());
        targetSummary.setText("接收终端：" + summarizeTargets(targets));
        targetSummary.setTextSize(13);
        targetSummary.setTextColor(android.graphics.Color.parseColor("#607D8B"));
        container.addView(targetSummary, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        EditText input = new EditText(requireContext());
        input.setMinLines(4);
        input.setMaxLines(6);
        input.setHint("请输入播报文字，或点击“语音输入”识别后发送");
        input.setTextSize(15);
        input.setPadding(dp(10), dp(10), dp(10), dp(10));
        LinearLayout.LayoutParams inputParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        inputParams.topMargin = dp(10);
        container.addView(input, inputParams);

        Button speechButton = new Button(requireContext());
        speechButton.setText("语音输入");
        speechButton.setOnClickListener(v -> startSpeechInput(input));
        LinearLayout.LayoutParams speechParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(42)
        );
        speechParams.topMargin = dp(10);
        container.addView(speechButton, speechParams);

        new AlertDialog.Builder(requireContext())
                .setTitle("JT808语音转文字播报")
                .setView(container)
                .setNegativeButton("取消", null)
                .setPositiveButton("发送播报", (dialog, which) -> {
                    String text = input.getText() == null ? "" : input.getText().toString().trim();
                    if (TextUtils.isEmpty(text)) {
                        Toast.makeText(requireContext(), "请输入或识别播报内容", Toast.LENGTH_SHORT).show();
                        return;
                    }
                    sendJt808Broadcast(targets, text);
                })
                .show();
    }

    private String summarizeTargets(List<Jt808Target> targets) {
        List<String> names = new ArrayList<>();
        for (Jt808Target target : targets) {
            names.add(target.name);
            if (names.size() >= 3) break;
        }
        String summary = TextUtils.join("、", names);
        if (targets.size() > 3) {
            summary += " 等" + targets.size() + "台";
        }
        return summary;
    }

    private void startSpeechInput(EditText targetInput) {
        activeTtsInput = targetInput;
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.CHINA.toString());
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "请说出要播报的内容");
        try {
            speechInputLauncher.launch(intent);
        } catch (Exception e) {
            Toast.makeText(requireContext(), "当前设备不支持系统语音识别", Toast.LENGTH_SHORT).show();
        }
    }

    private void handleSpeechInputResult(ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || activeTtsInput == null) {
            return;
        }
        ArrayList<String> matches = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        if (matches == null || matches.isEmpty()) {
            return;
        }
        String recognized = matches.get(0);
        String current = activeTtsInput.getText() == null ? "" : activeTtsInput.getText().toString().trim();
        activeTtsInput.setText(TextUtils.isEmpty(current) ? recognized : current + "\n" + recognized);
        activeTtsInput.setSelection(activeTtsInput.getText().length());
    }

    private void sendJt808Broadcast(List<Jt808Target> targets, String text) {
        List<String> phones = new ArrayList<>();
        for (Jt808Target target : targets) {
            phones.add(target.phone);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("text", text);
        body.put("target_phones", phones);
        body.put("request_source", "app");
        body.put("operator", new SessionManager(requireContext()).getNickname());

        setBroadcastLoading(true);
        CallApi api = ApiClient.get(requireContext()).create(CallApi.class);
        api.sendTTS(body).enqueue(new Callback<Map<String, Object>>() {
            @Override
            public void onResponse(@NonNull Call<Map<String, Object>> call, @NonNull Response<Map<String, Object>> response) {
                setBroadcastLoading(false);
                if (response.isSuccessful()) {
                    Toast.makeText(requireContext(), "JT808播报已提交，回执可在通信回放查看", Toast.LENGTH_LONG).show();
                } else {
                    Toast.makeText(requireContext(), "JT808播报发送失败", Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onFailure(@NonNull Call<Map<String, Object>> call, @NonNull Throwable t) {
                setBroadcastLoading(false);
                Toast.makeText(requireContext(), "JT808播报发送失败: " + t.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private List<Jt808Target> selectedJt808Targets() {
        List<Jt808Target> result = new ArrayList<>();
        for (Jt808Target target : allJt808Targets) {
            if (selectedJt808Phones.contains(target.phone)) {
                result.add(target);
            }
        }
        return result;
    }

    private void setBroadcastLoading(boolean loading) {
        progressBar.setVisibility(loading ? View.VISIBLE : View.GONE);
        if (currentMode == CommMode.JT808_MESSAGE) {
            btnStartCall.setEnabled(!loading && !selectedJt808Phones.isEmpty());
            btnStartCall.setText(loading ? "正在处理..." : "发送工牌消息");
        }
    }

    private void setLoading(boolean loading) {
        progressBar.setVisibility(loading ? View.VISIBLE : View.GONE);
        btnStartCall.setEnabled(!loading);
        btnStartCall.setText(loading ? "正在创建..." : "发起语音通话");
    }

    private void updateSelectionState() {
        int count = currentMode == CommMode.APP_VOICE ? selectedIds.size() : selectedJt808Phones.size();
        tvSelectedCount.setText(currentMode == CommMode.APP_VOICE
                ? String.format(Locale.getDefault(), "已选择 %d 人", count)
                : String.format(Locale.getDefault(), "已选择 %d 个工牌", count));
        tvSubtitle.setText(currentMode == CommMode.APP_VOICE
                ? (count == 0 ? "选择成员后发起实时语音房间" : "将邀请所选成员加入 Agora 语音房间")
                : (count == 0 ? "选择定位工牌后发送文字播报消息" : "将向所选定位工牌发送文字播报"));
        btnStartCall.setEnabled(count > 0);
    }

    private class ContactAdapter extends RecyclerView.Adapter<ContactAdapter.VH> {
        @NonNull
        @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_contact, parent, false);
            return new VH(view);
        }

        @Override
        public void onBindViewHolder(@NonNull VH holder, int position) {
            if (currentMode == CommMode.APP_VOICE) {
                holder.bindContact(contacts.get(position));
            } else {
                holder.bindJt808(jt808Targets.get(position));
            }
        }

        @Override
        public int getItemCount() {
            return currentMode == CommMode.APP_VOICE ? contacts.size() : jt808Targets.size();
        }

        class VH extends RecyclerView.ViewHolder {
            TextView tvName;
            TextView tvCompany;
            TextView tvProject;
            TextView tvAvatar;
            CheckBox cbSelected;

            VH(@NonNull View itemView) {
                super(itemView);
                tvAvatar = itemView.findViewById(R.id.tv_avatar);
                tvName = itemView.findViewById(R.id.tv_name);
                tvCompany = itemView.findViewById(R.id.tv_company);
                tvProject = itemView.findViewById(R.id.tv_project);
                cbSelected = itemView.findViewById(R.id.cb_selected);
            }

            void bindContact(Contact contact) {
                tvName.setText(contact.name);
                tvAvatar.setText("语");
                String orgPath = contact.orgPath();
                tvCompany.setText(TextUtils.isEmpty(orgPath)
                        ? (TextUtils.isEmpty(contact.dept) ? "未设置部门" : contact.dept)
                        : orgPath);
                tvProject.setText(TextUtils.isEmpty(contact.role) ? "成员" : contact.role);
                cbSelected.setOnCheckedChangeListener(null);
                cbSelected.setChecked(selectedIds.contains(contact.id));

                itemView.setSelected(selectedIds.contains(contact.id));
                View.OnClickListener toggle = v -> {
                    if (selectedIds.contains(contact.id)) {
                        selectedIds.remove(contact.id);
                    } else {
                        selectedIds.add(contact.id);
                    }
                    int adapterPosition = getBindingAdapterPosition();
                    if (adapterPosition != RecyclerView.NO_POSITION) {
                        notifyItemChanged(adapterPosition);
                    }
                    updateSelectionState();
                };
                itemView.setOnClickListener(toggle);
                cbSelected.setOnClickListener(toggle);
            }

            void bindJt808(Jt808Target target) {
                tvName.setText(target.name);
                tvAvatar.setText("牌");
                tvCompany.setText(TextUtils.isEmpty(target.phone) ? "定位工牌" : target.phone);
                tvProject.setText(target.isOnline() ? "在线 / 可接收文字播报" : "离线或状态未知");
                cbSelected.setOnCheckedChangeListener(null);
                cbSelected.setChecked(selectedJt808Phones.contains(target.phone));

                itemView.setSelected(selectedJt808Phones.contains(target.phone));
                View.OnClickListener toggle = v -> {
                    if (selectedJt808Phones.contains(target.phone)) {
                        selectedJt808Phones.remove(target.phone);
                    } else {
                        selectedJt808Phones.add(target.phone);
                    }
                    int adapterPosition = getBindingAdapterPosition();
                    if (adapterPosition != RecyclerView.NO_POSITION) {
                        notifyItemChanged(adapterPosition);
                    }
                    updateSelectionState();
                };
                itemView.setOnClickListener(toggle);
                cbSelected.setOnClickListener(toggle);
            }
        }
    }

    private static class Jt808Target {
        final String phone;
        final String name;
        final String status;

        Jt808Target(String phone, String name, String status) {
            this.phone = phone == null ? "" : phone.trim();
            this.name = name == null ? this.phone : name.trim();
            this.status = status == null ? "" : status.trim().toLowerCase(Locale.ROOT);
        }

        boolean isOnline() {
            return "online".equals(status) || "true".equals(status) || "1".equals(status);
        }

        String displayLabel() {
            String state = isOnline() ? "在线" : TextUtils.isEmpty(status) ? "未知" : status;
            return name + " / " + phone + " / " + state;
        }
    }

    private enum CommMode {
        APP_VOICE,
        JT808_MESSAGE
    }

    private interface OrgNodeClickListener {
        void onClick(OrgNode node);
    }

    private static class OrgNode {
        final String name;
        final OrgFilter filter;
        final int level;
        final List<OrgNode> children = new ArrayList<>();
        int count = 0;

        OrgNode(String name, OrgFilter filter, int level) {
            this.name = name == null ? "" : name.trim();
            this.filter = filter;
            this.level = level;
        }

        OrgNode child(String childName, OrgFilter childFilter) {
            if (TextUtils.isEmpty(childName)) return null;
            for (OrgNode child : children) {
                if (TextUtils.equals(child.name, childName)) return child;
            }
            OrgNode child = new OrgNode(childName, childFilter, level + 1);
            children.add(child);
            return child;
        }

        String key() {
            return filter == null ? name : filter.key();
        }
    }

    private class OrgTreeAdapter extends RecyclerView.Adapter<OrgTreeAdapter.VH> {
        private final OrgNode root;
        private final OrgNodeClickListener listener;
        private final Set<String> expandedKeys = new HashSet<>();
        private final List<OrgNode> visibleNodes = new ArrayList<>();

        OrgTreeAdapter(OrgNode root, OrgNodeClickListener listener) {
            this.root = root;
            this.listener = listener;
            expandedKeys.add(root.key());
            expandSelectedPath(root);
            rebuild();
        }

        private boolean expandSelectedPath(OrgNode node) {
            boolean matched = node.filter != null && node.filter.sameAs(selectedOrgFilter);
            for (OrgNode child : node.children) {
                if (expandSelectedPath(child)) {
                    expandedKeys.add(node.key());
                    matched = true;
                }
            }
            return matched;
        }

        private void rebuild() {
            visibleNodes.clear();
            addVisible(root);
        }

        private void addVisible(OrgNode node) {
            visibleNodes.add(node);
            if (!expandedKeys.contains(node.key())) return;
            for (OrgNode child : node.children) addVisible(child);
        }

        @NonNull
        @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            android.widget.LinearLayout row = new android.widget.LinearLayout(parent.getContext());
            row.setOrientation(android.widget.LinearLayout.HORIZONTAL);
            row.setGravity(android.view.Gravity.CENTER_VERTICAL);
            row.setPadding(dp(14), dp(10), dp(14), dp(10));
            row.setLayoutParams(new RecyclerView.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
            ));

            TextView arrow = new TextView(parent.getContext());
            arrow.setTextSize(16);
            arrow.setTextColor(android.graphics.Color.parseColor("#607D8B"));
            row.addView(arrow, new android.widget.LinearLayout.LayoutParams(dp(24), ViewGroup.LayoutParams.WRAP_CONTENT));

            TextView title = new TextView(parent.getContext());
            title.setTextSize(16);
            title.setTextColor(android.graphics.Color.parseColor("#263238"));
            title.setSingleLine(true);
            title.setEllipsize(TextUtils.TruncateAt.END);
            row.addView(title, new android.widget.LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

            TextView count = new TextView(parent.getContext());
            count.setTextSize(12);
            count.setTextColor(android.graphics.Color.parseColor("#78909C"));
            row.addView(count, new android.widget.LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

            return new VH(row, arrow, title, count);
        }

        @Override
        public void onBindViewHolder(@NonNull VH holder, int position) {
            OrgNode node = visibleNodes.get(position);
            holder.itemView.setPadding(dp(12 + node.level * 18), dp(10), dp(14), dp(10));
            holder.arrow.setText(node.children.isEmpty() ? "" : expandedKeys.contains(node.key()) ? "-" : "+");
            holder.title.setText(node.name);
            holder.count.setText(node.count + "人");
            boolean selected = node.filter != null && node.filter.sameAs(selectedOrgFilter);
            holder.title.setTextColor(android.graphics.Color.parseColor(selected ? "#00897B" : "#263238"));
            holder.itemView.setBackgroundColor(android.graphics.Color.parseColor(selected ? "#E0F2F1" : "#FFFFFF"));
            holder.arrow.setOnClickListener(v -> {
                if (!node.children.isEmpty()) {
                    if (expandedKeys.contains(node.key())) {
                        expandedKeys.remove(node.key());
                    } else {
                        expandedKeys.add(node.key());
                    }
                    rebuild();
                    notifyDataSetChanged();
                }
            });
            holder.itemView.setOnClickListener(v -> {
                if (listener != null) listener.onClick(node);
            });
        }

        @Override
        public int getItemCount() {
            return visibleNodes.size();
        }

        class VH extends RecyclerView.ViewHolder {
            final TextView arrow;
            final TextView title;
            final TextView count;

            VH(@NonNull View itemView, TextView arrow, TextView title, TextView count) {
                super(itemView);
                this.arrow = arrow;
                this.title = title;
                this.count = count;
            }
        }
    }

    private static class Contact {
        final String id;
        final String name;
        final String dept;
        final String role;
        final String company;
        final String project;
        final String grid;
        final String team;

        Contact(String id, String name, String dept, String role, String company, String project, String grid, String team) {
            this.id = clean(id);
            this.name = clean(name);
            this.dept = clean(dept);
            this.role = clean(role);
            this.company = clean(company);
            this.project = clean(project);
            this.grid = clean(grid);
            this.team = clean(team);
        }

        String orgPath() {
            List<String> parts = new ArrayList<>();
            addPart(parts, company);
            addPart(parts, project);
            addPart(parts, grid);
            addPart(parts, team);
            return TextUtils.join(" / ", parts);
        }

        String searchText() {
            return TextUtils.join(" ", new String[]{id, name, dept, role, company, project, grid, team});
        }

        private static String clean(String value) {
            return value == null ? "" : value.trim();
        }

        private static void addPart(List<String> parts, String value) {
            if (!TextUtils.isEmpty(value) && !parts.contains(value)) parts.add(value);
        }
    }

    private static class OrgFilter {
        final int level;
        final String company;
        final String project;
        final String grid;
        final String team;
        final String display;

        OrgFilter(int level, String company, String project, String grid, String team) {
            this.level = level;
            this.company = clean(company);
            this.project = clean(project);
            this.grid = clean(grid);
            this.team = clean(team);
            this.display = buildDisplay();
        }

        static OrgFilter all() {
            return new OrgFilter(0, "", "", "", "");
        }

        boolean matches(Contact contact) {
            if (level == 0) return true;
            if (!TextUtils.isEmpty(company) && !TextUtils.equals(company, contact.company)) return false;
            if (!TextUtils.isEmpty(project) && !TextUtils.equals(project, contact.project)) return false;
            if (!TextUtils.isEmpty(grid) && !TextUtils.equals(grid, contact.grid)) return false;
            return TextUtils.isEmpty(team) || TextUtils.equals(team, contact.team);
        }

        boolean sameAs(OrgFilter other) {
            if (other == null) return false;
            return level == other.level
                    && TextUtils.equals(company, other.company)
                    && TextUtils.equals(project, other.project)
                    && TextUtils.equals(grid, other.grid)
                    && TextUtils.equals(team, other.team);
        }

        String key() {
            return level + "|" + company + "|" + project + "|" + grid + "|" + team;
        }

        String currentValue() {
            if (level == 1) return company;
            if (level == 2) return project;
            if (level == 3) return grid;
            if (level == 4) return team;
            return "";
        }

        String buttonText() {
            return level == 0 ? "??" : currentValue();
        }

        private String buildDisplay() {
            if (level == 0) return "????";
            String indent = level == 1 ? "" : level == 2 ? "?? " : level == 3 ? "??? " : "???? ";
            String prefix = level == 1 ? "?? " : level == 2 ? "?? " : level == 3 ? "?? " : "?? ";
            return indent + prefix + currentValue();
        }

        private static String clean(String value) {
            return value == null ? "" : value.trim();
        }
    }

}
