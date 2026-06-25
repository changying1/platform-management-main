package com.app.myapplication.ui.management.fragment;

import android.app.AlertDialog;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.text.Editable;
import android.text.TextWatcher;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.Person;
import com.app.myapplication.ui.management.adapter.PersonAdapter;
import com.google.android.material.floatingactionbutton.FloatingActionButton;
import com.google.gson.JsonObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

/**
 * 人员管理 - 对应 Web 端 PersonManagement
 */
public class PersonManagementFragment extends BaseManagementFragment {

    private RecyclerView recyclerView;
    private PersonAdapter adapter;
    private TextView tvEmpty;
    private TextView tvCount;
    private FloatingActionButton fabAdd;
    private EditText etSearch;
    private TextView btnOrgFilter;
    private TextView btnClearOrgFilter;
    private LinearLayout layoutOrgTree;
    
    private List<Person> persons = new ArrayList<>();
    private List<Person> displayPersons = new ArrayList<>();
    private String filterCompany = "";
    private String filterProject = "";
    private String filterGrid = "";
    private String filterTeam = "";
    private final Set<String> expandedOrgKeys = new HashSet<>();
    private final List<OrgNode> selectableOrgTreeNodes = new ArrayList<>();

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_person_management, container, false);
        
        initViews(view);
        setupRecyclerView();
        loadData();
        loadSelectableOrgTree();
        
        return view;
    }

    private void loadSelectableOrgTree() {
        managementApi.getResponsibilityTree(getAuthHeaders()).enqueue(new Callback<List<JsonObject>>() {
            @Override
            public void onResponse(Call<List<JsonObject>> call, Response<List<JsonObject>> response) {
                selectableOrgTreeNodes.clear();
                if (response.isSuccessful() && response.body() != null) {
                    for (JsonObject node : response.body()) {
                        collectOrgTreeNode(node, "", "", "", "");
                    }
                }
            }

            @Override
            public void onFailure(Call<List<JsonObject>> call, Throwable t) {
                selectableOrgTreeNodes.clear();
            }
        });
    }

    private void initViews(View view) {
        recyclerView = view.findViewById(R.id.recycler_view);
        tvEmpty = view.findViewById(R.id.tv_empty);
        tvCount = view.findViewById(R.id.tv_count);
        fabAdd = view.findViewById(R.id.fab_add);
        etSearch = view.findViewById(R.id.et_search);
        btnOrgFilter = view.findViewById(R.id.btn_org_filter);
        btnClearOrgFilter = view.findViewById(R.id.btn_clear_org_filter);
        layoutOrgTree = view.findViewById(R.id.layout_org_tree);
        
        TextView tvTitle = view.findViewById(R.id.tv_title);
        tvTitle.setText("人员管理");
        
        if (hasPermission("personnel.create")) {
            fabAdd.setOnClickListener(v -> showAddDialog());
        } else {
            fabAdd.hide();
        }

        etSearch.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                applyFilter();
            }
            @Override public void afterTextChanged(Editable s) {}
        });

        btnOrgFilter.setOnClickListener(v -> toggleOrgTree());
        btnClearOrgFilter.setOnClickListener(v -> {
            filterCompany = "";
            filterProject = "";
            filterGrid = "";
            filterTeam = "";
            expandedOrgKeys.clear();
            layoutOrgTree.setVisibility(View.GONE);
            updateOrgFilterText();
            applyFilter();
        });
        
        setupSwipeRefresh(view, R.id.swipe_refresh, this::loadData);
    }

    private void setupRecyclerView() {
        recyclerView.setLayoutManager(new LinearLayoutManager(requireContext()));
        adapter = new PersonAdapter(displayPersons, hasPermission("personnel.edit"), hasPermission("personnel.delete"));
        recyclerView.setAdapter(adapter);
    }

    private void loadData() {
        showLoading();
        
        // 调用 API 获取人员列表 - 与 Web 端对齐 /api/personnel/
        managementApi.getPersonnel(getAuthHeaders()).enqueue(new Callback<List<JsonObject>>() {
            @Override
            public void onResponse(Call<List<JsonObject>> call, Response<List<JsonObject>> response) {
                hideLoading();
                if (response.isSuccessful() && response.body() != null) {
                    List<JsonObject> apiData = response.body();
                    if (apiData.size() > 0) {
                        persons.clear();
                        for (JsonObject p : apiData) {
                            Person person = parsePersonFromJson(p);
                            if (person != null) {
                                persons.add(person);
                            }
                        }
                    } else {
                        loadMockData();
                    }
                } else {
                    loadMockData();
                }
                applyFilter();
            }

            @Override
            public void onFailure(Call<List<JsonObject>> call, Throwable t) {
                hideLoading();
                loadMockData();
                applyFilter();
                showToast("网络错误，显示本地数据");
            }
        });
    }

    /**
     * 从 JSON 解析人员数据 - 与 Web 端映射逻辑对齐
     */
    private Person parsePersonFromJson(JsonObject p) {
        try {
            String id = p.has("id") ? p.get("id").getAsString() : "0";
            String name = p.has("full_name") ? p.get("full_name").getAsString() : 
                         (p.has("username") ? p.get("username").getAsString() : "");
            String employeeId = p.has("employee_code") ? p.get("employee_code").getAsString() : "";
            String phone = p.has("phone") ? p.get("phone").getAsString() : "";
            String workType = p.has("work_type_id") ? p.get("work_type_id").getAsString() : "普通员工";
            String workTeam = p.has("work_team") ? p.get("work_team").getAsString() : 
                             (p.has("team") ? p.get("team").getAsString() : "");
            String project = p.has("project") ? p.get("project").getAsString() : "";
            String grid = p.has("grid_name") ? p.get("grid_name").getAsString() :
                         (p.has("grid") ? p.get("grid").getAsString() : "");
            String company = p.has("company") ? p.get("company").getAsString() : "";
            String status = p.has("status") ? p.get("status").getAsString() : "active";
            String entryDate = p.has("entry_date") ? p.get("entry_date").getAsString() : "2024-01-01";
            
            Person person = new Person(id, name, employeeId, phone, workType, workTeam, project, company, status, entryDate);
            person.setGrid(grid);
            return person;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 加载硬编码数据 - 与 Web 端 SQL_PERSONNEL 对齐
     */
    private void loadMockData() {
        persons.clear();
        
        persons.add(new Person("1", "张建国", "HQ-ADMIN-001", "13900000001", 
            "管理人员", "总公司", "总公司", "总部", "active", "2024-01-01"));
        persons.add(new Person("2", "王振国", "BR-ADMIN-001", "13900001001",
            "管理人员", "第一分公司", "西安东站", "第一分公司", "active", "2024-01-01"));
        persons.add(new Person("3", "李志远", "BR-ADMIN-002", "13900001002",
            "管理人员", "第二分公司", "西安地铁8号线", "第二分公司", "active", "2024-01-01"));
        persons.add(new Person("4", "张伟", "XA-WK-001", "13800101001",
            "土建工", "土建工队", "默认项目", "默认分公司", "active", "2024-02-15"));
        persons.add(new Person("5", "王强", "XA-WK-002", "13800101002",
            "土建工", "土建工队", "默认项目", "默认分公司", "active", "2024-02-15"));
        persons.add(new Person("6", "李磊", "XA-WK-003", "13800101003",
            "土建工", "土建工队", "默认项目", "默认分公司", "active", "2024-02-15"));
        persons.add(new Person("7", "赵勇", "XA-WK-004", "13800101004",
            "架子工", "土建工队", "默认项目", "默认分公司", "active", "2024-02-15"));
        persons.add(new Person("8", "刘杰", "XA-WK-005", "13800101005",
            "电工", "机电工队", "默认项目", "默认分公司", "active", "2024-02-15"));
        persons.add(new Person("9", "陈涛", "XA-WK-006", "13800101006",
            "焊工", "机电工队", "默认项目", "默认分公司", "active", "2024-02-15"));
        persons.add(new Person("10", "周明", "XA-WK-007", "13800101007",
            "起重工", "起重工队", "默认项目", "默认分公司", "active", "2024-02-15"));
    }

    private void updateUI() {
        tvCount.setText(String.format("共 %d 人", displayPersons.size()));
        if (displayPersons.isEmpty()) {
            tvEmpty.setVisibility(View.VISIBLE);
            recyclerView.setVisibility(View.GONE);
        } else {
            tvEmpty.setVisibility(View.GONE);
            recyclerView.setVisibility(View.VISIBLE);
        }
    }

    private void showAddDialog() {
        showAddModeDialog();
    }

    private void showAddModeDialog() {
        String[] modes = {"一般添加", "批量添加"};
        new AlertDialog.Builder(requireContext())
                .setTitle("添加人员")
                .setItems(modes, (dialog, which) -> {
                    if (which == 0) {
                        showPersonFormDialog(false, new BatchDefaults());
                    } else {
                        showBatchDefaultsDialog();
                    }
                })
                .show();
    }

    private void showBatchDefaultsDialog() {
        List<OrgNode> orgNodes = buildSelectableOrgNodes();
        if (orgNodes.isEmpty()) {
            showToast("暂无可添加的下级单位");
            return;
        }

        LinearLayout content = createFormContainer();
        EditText etWorkType = addInput(content, "工种", "");
        EditText etEntryDate = addInput(content, "入场日期", today());
        Spinner spStatus = addTextSpinner(content, "状态", new String[]{"在职", "离职"});
        OrgPicker spOrg = createOrgPicker(content, orgNodes);

        ScrollView scrollView = new ScrollView(requireContext());
        scrollView.addView(content);

        new AlertDialog.Builder(requireContext())
                .setTitle("批量添加公共项")
                .setView(scrollView)
                .setNegativeButton("取消", null)
                .setPositiveButton("开始录入", (dialog, which) -> {
                    BatchDefaults defaults = new BatchDefaults();
                    defaults.orgNode = spOrg.selected;
                    defaults.workType = value(etWorkType);
                    defaults.entryDate = value(etEntryDate);
                    defaults.status = spStatus.getSelectedItemPosition() == 0 ? "active" : "inactive";
                    showPersonFormDialog(true, defaults);
                })
                .show();
    }

    private void showPersonFormDialog(boolean batchMode, BatchDefaults defaults) {
        List<OrgNode> orgNodes = buildSelectableOrgNodes();
        if (orgNodes.isEmpty()) {
            showToast("暂无可添加的下级单位");
            return;
        }

        PersonForm form = createPersonForm(orgNodes, defaults);
        AlertDialog dialog = new AlertDialog.Builder(requireContext())
                .setTitle(batchMode ? "批量添加人员" : "一般添加人员")
                .setView(form.scrollView)
                .setNegativeButton("取消", null)
                .setPositiveButton(batchMode ? "保存并继续" : "保存", null)
                .create();

        dialog.setOnShowListener(d -> {
            Button positive = dialog.getButton(AlertDialog.BUTTON_POSITIVE);
            positive.setOnClickListener(v -> submitPersonForm(form, orgNodes, batchMode, dialog));
        });
        dialog.show();
    }

    private PersonForm createPersonForm(List<OrgNode> orgNodes, BatchDefaults defaults) {
        LinearLayout content = createFormContainer();
        PersonForm form = new PersonForm();
        form.name = addInput(content, "姓名 *", "");
        form.employeeId = addInput(content, "工号", "");
        form.phone = addInput(content, "手机号", "");
        form.idCard = addInput(content, "身份证号", "");
        form.workType = addInput(content, "工种", defaults.workType);
        form.entryDate = addInput(content, "入场日期", isBlank(defaults.entryDate) ? today() : defaults.entryDate);
        form.emergencyContact = addInput(content, "紧急联系人", "");
        form.org = createOrgPicker(content, orgNodes);
        form.status = addTextSpinner(content, "状态", new String[]{"在职", "离职"});

        if (defaults.orgNode != null) {
            for (int i = 0; i < orgNodes.size(); i++) {
                if (orgNodes.get(i).key().equals(defaults.orgNode.key())) {
                    form.org.select(orgNodes.get(i));
                    break;
                }
            }
        }
        form.status.setSelection("inactive".equals(defaults.status) ? 1 : 0);

        form.scrollView = new ScrollView(requireContext());
        form.scrollView.addView(content);
        return form;
    }

    private void submitPersonForm(PersonForm form, List<OrgNode> orgNodes, boolean batchMode, AlertDialog dialog) {
        String name = value(form.name);
        if (isBlank(name)) {
            form.name.setError("请输入姓名");
            return;
        }

        OrgNode orgNode = form.org.selected;
        JsonObject body = new JsonObject();
        body.addProperty("username", name);
        body.addProperty("role", "Worker");
        body.addProperty("employeeId", value(form.employeeId));
        body.addProperty("phone", value(form.phone));
        body.addProperty("idCard", value(form.idCard));
        body.addProperty("workType", value(form.workType));
        body.addProperty("entryDate", value(form.entryDate));
        body.addProperty("emergencyContact", value(form.emergencyContact));
        body.addProperty("status", form.status.getSelectedItemPosition() == 0 ? "active" : "inactive");
        body.addProperty("company", orgNode.company);
        body.addProperty("dept", orgNode.company);
        body.addProperty("project", orgNode.project);
        body.addProperty("gridId", orgNode.grid);
        body.addProperty("team", orgNode.team);
        body.addProperty("workTeam", orgNode.team);

        managementApi.createPerson(getAuthHeaders(), body).enqueue(new Callback<JsonObject>() {
            @Override
            public void onResponse(Call<JsonObject> call, Response<JsonObject> response) {
                if (response.isSuccessful()) {
                    showToast(batchMode ? "已添加，可继续录入下一人" : "添加成功");
                    loadData();
                    if (batchMode) {
                        clearPersonOnlyFields(form);
                    } else {
                        dialog.dismiss();
                    }
                } else if (response.code() == 403) {
                    showToast("只能添加到自己直系所属单位以下的单位");
                } else {
                    showToast("添加失败");
                }
            }

            @Override
            public void onFailure(Call<JsonObject> call, Throwable t) {
                showToast("网络错误，添加失败");
            }
        });
    }

    private LinearLayout createFormContainer() {
        LinearLayout content = new LinearLayout(requireContext());
        content.setOrientation(LinearLayout.VERTICAL);
        int padding = (int) (20 * getResources().getDisplayMetrics().density);
        content.setPadding(padding, padding / 2, padding, padding / 2);
        return content;
    }

    private EditText addInput(LinearLayout parent, String hint, String text) {
        EditText editText = new EditText(requireContext());
        editText.setHint(hint);
        editText.setText(text);
        editText.setSingleLine(true);
        parent.addView(editText, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));
        return editText;
    }

    private Spinner addTextSpinner(LinearLayout parent, String title, String[] items) {
        parent.addView(label(title));
        Spinner spinner = new Spinner(requireContext());
        ArrayAdapter<String> adapter = new ArrayAdapter<>(requireContext(), android.R.layout.simple_spinner_item, items);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinner.setAdapter(adapter);
        parent.addView(spinner);
        return spinner;
    }

    private Spinner createOrgSpinner(List<OrgNode> orgNodes) {
        List<String> labels = new ArrayList<>();
        for (OrgNode node : orgNodes) {
            labels.add(buildOrgPath(node));
        }
        Spinner spinner = new Spinner(requireContext());
        ArrayAdapter<String> adapter = new ArrayAdapter<>(requireContext(), android.R.layout.simple_spinner_item, labels);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinner.setAdapter(adapter);
        return spinner;
    }

    private OrgPicker createOrgPicker(LinearLayout parent, List<OrgNode> orgNodes) {
        parent.addView(label("所属单位 *"));
        TextView value = new TextView(requireContext());
        value.setTextSize(15);
        value.setTextColor(getResources().getColor(R.color.text_primary));
        value.setPadding(0, (int) (14 * getResources().getDisplayMetrics().density), 0,
                (int) (10 * getResources().getDisplayMetrics().density));
        OrgPicker picker = new OrgPicker(value);
        if (!orgNodes.isEmpty()) {
            picker.select(orgNodes.get(0));
        } else {
            value.setText("请选择所属单位");
        }
        value.setOnClickListener(v -> showOrgTreePicker(orgNodes, picker));
        parent.addView(value, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));
        return picker;
    }

    private void showOrgTreePicker(List<OrgNode> orgNodes, OrgPicker picker) {
        LinearLayout tree = new LinearLayout(requireContext());
        tree.setOrientation(LinearLayout.VERTICAL);
        Set<String> expanded = new HashSet<>();
        for (OrgNode node : orgNodes) {
            if (node.level <= 0) {
                expanded.add(node.key());
            }
        }
        AlertDialog dialog = new AlertDialog.Builder(requireContext())
                .setTitle("按单位树选择")
                .setView(scroll(tree))
                .setNegativeButton("取消", null)
                .create();
        Runnable[] render = new Runnable[1];
        render[0] = () -> {
            tree.removeAllViews();
            for (OrgNode node : visiblePickerNodes(orgNodes, expanded)) {
                TextView row = new TextView(requireContext());
                row.setText(pickerPrefix(orgNodes, expanded, node) + node.label);
                row.setTextSize(15);
                row.setTextColor(getResources().getColor(R.color.text_primary));
                row.setPadding((int) ((12 + node.level * 18) * getResources().getDisplayMetrics().density),
                        0, (int) (12 * getResources().getDisplayMetrics().density), 0);
                row.setGravity(android.view.Gravity.CENTER_VERTICAL);
                row.setMinHeight((int) (44 * getResources().getDisplayMetrics().density));
                row.setOnClickListener(v -> {
                    if (hasPickerChildren(orgNodes, node)) {
                        if (expanded.contains(node.key())) {
                            expanded.remove(node.key());
                        } else {
                            expanded.add(node.key());
                        }
                        render[0].run();
                    } else {
                        picker.select(node);
                        dialog.dismiss();
                    }
                });
                row.setOnLongClickListener(v -> {
                    picker.select(node);
                    dialog.dismiss();
                    return true;
                });
                tree.addView(row);
            }
        };
        render[0].run();
        dialog.show();
    }

    private ScrollView scroll(View content) {
        ScrollView scrollView = new ScrollView(requireContext());
        scrollView.addView(content);
        return scrollView;
    }

    private List<OrgNode> visiblePickerNodes(List<OrgNode> all, Set<String> expanded) {
        List<OrgNode> visible = new ArrayList<>();
        for (OrgNode node : all) {
            if (node.level == 0 || ancestorsExpanded(all, expanded, node)) {
                visible.add(node);
            }
        }
        return visible;
    }

    private boolean ancestorsExpanded(List<OrgNode> all, Set<String> expanded, OrgNode node) {
        for (OrgNode possibleParent : all) {
            if (isPickerParent(possibleParent, node) && !expanded.contains(possibleParent.key())) {
                return false;
            }
        }
        return true;
    }

    private String pickerPrefix(List<OrgNode> all, Set<String> expanded, OrgNode node) {
        if (!hasPickerChildren(all, node)) {
            return "   ";
        }
        return expanded.contains(node.key()) ? "-  " : "+  ";
    }

    private boolean hasPickerChildren(List<OrgNode> all, OrgNode node) {
        for (OrgNode candidate : all) {
            if (isPickerParent(node, candidate)) {
                return true;
            }
        }
        return false;
    }

    private boolean isPickerParent(OrgNode parent, OrgNode child) {
        if (child.level != parent.level + 1) return false;
        if (!matchesExact(parent.company, child.company)) return false;
        if (parent.level >= 1 && !matchesExact(parent.project, child.project)) return false;
        if (parent.level >= 2 && !matchesExact(parent.grid, child.grid)) return false;
        return true;
    }

    private TextView label(String text) {
        TextView label = new TextView(requireContext());
        label.setText(text);
        label.setTextSize(13);
        label.setPadding(0, (int) (12 * getResources().getDisplayMetrics().density), 0, 0);
        return label;
    }

    private List<OrgNode> buildSelectableOrgNodes() {
        if (!selectableOrgTreeNodes.isEmpty()) {
            return new ArrayList<>(selectableOrgTreeNodes);
        }
        Map<String, OrgNode> nodes = new LinkedHashMap<>();
        addSelectableChildren(nodes, new OrgNode("root", "", "", "", "", 0));
        if (nodes.isEmpty()) {
            String company = normalize(sessionManager.getCompany());
            String project = normalize(sessionManager.getProject());
            String team = normalize(sessionManager.getTeam());
            if (!isBlank(company) || !isBlank(project) || !isBlank(team)) {
                OrgNode fallback = new OrgNode(buildFallbackLabel(company, project, team), company, project, "", team, 3);
                nodes.put(fallback.key(), fallback);
            }
        }
        return new ArrayList<>(nodes.values());
    }

    private void collectOrgTreeNode(JsonObject json, String company, String project, String grid, String team) {
        String name = jsonText(json, "name");
        String type = normalizeUnitType(jsonText(json, "type"));
        String nextCompany = company;
        String nextProject = project;
        String nextGrid = grid;
        String nextTeam = team;
        int level = 0;

        if ("branch".equals(type) || "company".equals(type)) {
            nextCompany = name;
            nextProject = "";
            nextGrid = "";
            nextTeam = "";
            level = 0;
        } else if ("project".equals(type)) {
            nextProject = name;
            nextGrid = "";
            nextTeam = "";
            level = 1;
        } else if ("grid".equals(type)) {
            nextGrid = name;
            nextTeam = "";
            level = 2;
        } else if ("team".equals(type)) {
            nextTeam = name;
            level = 3;
        }

        if (!isBlank(name) && ("branch".equals(type) || "company".equals(type)
                || "project".equals(type) || "grid".equals(type) || "team".equals(type))) {
            OrgNode node = new OrgNode(name, nextCompany, nextProject, nextGrid, nextTeam, level);
            boolean exists = false;
            for (OrgNode old : selectableOrgTreeNodes) {
                if (old.key().equals(node.key())) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                selectableOrgTreeNodes.add(node);
            }
        }

        if (json.has("children") && json.get("children").isJsonArray()) {
            for (com.google.gson.JsonElement child : json.getAsJsonArray("children")) {
                if (child != null && child.isJsonObject()) {
                    collectOrgTreeNode(child.getAsJsonObject(), nextCompany, nextProject, nextGrid, nextTeam);
                }
            }
        }
    }

    private String jsonText(JsonObject json, String key) {
        if (json == null || !json.has(key) || json.get(key).isJsonNull()) {
            return "";
        }
        return normalize(json.get(key).getAsString());
    }

    private String normalizeUnitType(String type) {
        String value = normalize(type).toLowerCase(Locale.ROOT);
        if ("division".equals(value)) return "project";
        if ("site".equals(value)) return "grid";
        if ("subproject".equals(value)) return "team";
        return value;
    }

    private void addSelectableChildren(Map<String, OrgNode> nodes, OrgNode parent) {
        for (OrgNode child : buildOrgChildren(parent)) {
            nodes.put(child.key(), child);
            addSelectableChildren(nodes, child);
        }
    }

    private String buildOrgPath(OrgNode node) {
        StringBuilder builder = new StringBuilder();
        appendPath(builder, node.company);
        appendPath(builder, node.project);
        appendPath(builder, node.grid);
        appendPath(builder, node.team);
        return builder.length() == 0 ? node.label : builder.toString();
    }

    private String buildFallbackLabel(String company, String project, String team) {
        StringBuilder builder = new StringBuilder();
        appendPath(builder, company);
        appendPath(builder, project);
        appendPath(builder, team);
        return builder.length() == 0 ? "当前单位" : builder.toString();
    }

    private void clearPersonOnlyFields(PersonForm form) {
        form.name.setText("");
        form.employeeId.setText("");
        form.phone.setText("");
        form.idCard.setText("");
        form.emergencyContact.setText("");
        form.name.requestFocus();
    }

    private String value(EditText editText) {
        return editText.getText() == null ? "" : editText.getText().toString().trim();
    }

    private String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.CHINA).format(new Date());
    }

    private void applyFilter() {
        String keyword = etSearch == null ? "" : etSearch.getText().toString().trim().toLowerCase(Locale.ROOT);
        displayPersons.clear();
        for (Person person : persons) {
            if (matchesOrgFilter(person) && (keyword.isEmpty() || matches(person, keyword))) {
                displayPersons.add(person);
            }
        }
        adapter.notifyDataSetChanged();
        updateUI();
    }

    private boolean matches(Person person, String keyword) {
        return contains(person.getName(), keyword)
                || contains(person.getEmployeeId(), keyword)
                || contains(person.getPhone(), keyword)
                || contains(person.getWorkType(), keyword)
                || contains(person.getWorkTeam(), keyword)
                || contains(person.getProject(), keyword)
                || contains(person.getGrid(), keyword)
                || contains(person.getCompany(), keyword);
    }

    private boolean contains(String value, String keyword) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(keyword);
    }

    private boolean matchesOrgFilter(Person person) {
        return matchesExact(filterCompany, person.getCompany())
                && matchesExact(filterProject, person.getProject())
                && matchesExact(filterGrid, person.getGrid())
                && matchesExact(filterTeam, person.getWorkTeam());
    }

    private boolean matchesExact(String expected, String actual) {
        return isBlank(expected) || normalize(actual).equals(expected);
    }

    private void toggleOrgTree() {
        if (layoutOrgTree.getVisibility() == View.VISIBLE) {
            layoutOrgTree.setVisibility(View.GONE);
            return;
        }
        expandedOrgKeys.add("root");
        refreshOrgTree();
        layoutOrgTree.setVisibility(View.VISIBLE);
    }

    private void refreshOrgTree() {
        List<OrgNode> visibleNodes = buildVisibleOrgNodes();
        layoutOrgTree.removeAllViews();

        for (OrgNode node : visibleNodes) {
            TextView row = new TextView(requireContext());
            row.setLayoutParams(new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    (int) (44 * getResources().getDisplayMetrics().density)));
            row.setGravity(android.view.Gravity.CENTER_VERTICAL);
            row.setPadding((int) ((12 + node.level * 20) * getResources().getDisplayMetrics().density), 0,
                    (int) (12 * getResources().getDisplayMetrics().density), 0);
            row.setText(buildOrgNodeLabel(node));
            row.setTextColor(getResources().getColor(R.color.text_primary));
            row.setTextSize(15);
            row.setOnClickListener(v -> handleOrgNodeClick(node));
            layoutOrgTree.addView(row);
        }
    }

    private String buildOrgNodeLabel(OrgNode node) {
        boolean hasChildren = hasChildren(node);
        String prefix = hasChildren ? (expandedOrgKeys.contains(node.key()) ? "v  " : ">  ") : "   ";
        return prefix + node.label + "（" + countPeople(node) + "人）";
    }

    private void handleOrgNodeClick(OrgNode node) {
        if (hasChildren(node)) {
            String key = node.key();
            if (expandedOrgKeys.contains(key)) {
                collapseOrgNode(node);
            } else {
                expandedOrgKeys.add(key);
            }
            refreshOrgTree();
        } else {
            applyOrgNode(node);
            layoutOrgTree.setVisibility(View.GONE);
        }
    }

    private void collapseOrgNode(OrgNode node) {
        String prefix = node.key();
        List<String> removeKeys = new ArrayList<>();
        for (String key : expandedOrgKeys) {
            if (key.equals(prefix) || key.startsWith(prefix + "|")) {
                removeKeys.add(key);
            }
        }
        expandedOrgKeys.removeAll(removeKeys);
    }

    private List<OrgNode> buildVisibleOrgNodes() {
        List<OrgNode> visibleNodes = new ArrayList<>();
        OrgNode root = new OrgNode("全部组织", "", "", "", "", 0);
        visibleNodes.add(root);
        addVisibleChildren(visibleNodes, root);
        return visibleNodes;
    }

    private void addVisibleChildren(List<OrgNode> visibleNodes, OrgNode parent) {
        if (!expandedOrgKeys.contains(parent.key())) {
            return;
        }
        for (OrgNode child : buildOrgChildren(parent)) {
            visibleNodes.add(child);
            addVisibleChildren(visibleNodes, child);
        }
    }

    private List<OrgNode> buildOrgChildren(OrgNode parent) {
        Map<String, OrgNode> seen = new LinkedHashMap<>();
        for (Person person : persons) {
            if (!matchesExact(parent.company, person.getCompany())
                    || !matchesExact(parent.project, person.getProject())
                    || !matchesExact(parent.grid, person.getGrid())
                    || !matchesExact(parent.team, person.getWorkTeam())) {
                continue;
            }

            String company = normalize(person.getCompany());
            String project = normalize(person.getProject());
            String grid = normalize(person.getGrid());
            String team = normalize(person.getWorkTeam());

            if (parent.isRoot()) {
                addChildNode(seen, "c|" + company, company, company, "", "", "", 0);
            } else if (parent.level == 0) {
                addChildNode(seen, "p|" + company + "|" + project, project, company, project, "", "", 1);
            } else if (parent.level == 1) {
                if (!isBlank(grid)) {
                    addChildNode(seen, "g|" + company + "|" + project + "|" + grid, grid, company, project, grid, "", 2);
                } else if (!isBlank(team)) {
                    addChildNode(seen, "t|" + company + "|" + project + "|" + team, team, company, project, "", team, 3);
                }
            } else if (parent.level == 2 && !isBlank(team)) {
                addChildNode(seen, "t|" + company + "|" + project + "|" + grid + "|" + team, team, company, project, grid, team, 3);
            }
        }
        return new ArrayList<>(seen.values());
    }

    private void addChildNode(Map<String, OrgNode> seen, String key, String label,
                              String company, String project, String grid, String team, int level) {
        if (!isBlank(label) && !seen.containsKey(key)) {
            seen.put(key, new OrgNode(label, company, project, grid, team, level));
        }
    }

    private boolean hasChildren(OrgNode node) {
        return !buildOrgChildren(node).isEmpty();
    }

    private void applyOrgNode(OrgNode node) {
        filterCompany = node.company;
        filterProject = node.project;
        filterGrid = node.grid;
        filterTeam = node.team;
        updateOrgFilterText();
        applyFilter();
    }

    private int countPeople(OrgNode node) {
        int count = 0;
        for (Person person : persons) {
            if (matchesExact(node.company, person.getCompany())
                    && matchesExact(node.project, person.getProject())
                    && matchesExact(node.grid, person.getGrid())
                    && matchesExact(node.team, person.getWorkTeam())) {
                count++;
            }
        }
        return count;
    }

    private void updateOrgFilterText() {
        if (isBlank(filterCompany) && isBlank(filterProject) && isBlank(filterGrid) && isBlank(filterTeam)) {
            btnOrgFilter.setText("组织筛选：全部");
            return;
        }

        StringBuilder text = new StringBuilder("组织筛选：");
        appendPath(text, filterCompany);
        appendPath(text, filterProject);
        appendPath(text, filterGrid);
        appendPath(text, filterTeam);
        btnOrgFilter.setText(text.toString());
    }

    private void appendPath(StringBuilder builder, String value) {
        if (isBlank(value)) {
            return;
        }
        if (builder.length() > 0 && builder.charAt(builder.length() - 1) != '：') {
            builder.append(" / ");
        }
        builder.append(value);
    }

    private String normalize(String value) {
        if (value == null) {
            return "";
        }
        String normalized = value.trim();
        return "null".equalsIgnoreCase(normalized) ? "" : normalized;
    }

    private boolean isBlank(String value) {
        return normalize(value).isEmpty();
    }

    private static class BatchDefaults {
        OrgNode orgNode;
        String workType = "";
        String entryDate = "";
        String status = "active";
    }

    private static class PersonForm {
        ScrollView scrollView;
        EditText name;
        EditText employeeId;
        EditText phone;
        EditText idCard;
        EditText workType;
        EditText entryDate;
        EditText emergencyContact;
        OrgPicker org;
        Spinner status;
    }

    private class OrgPicker {
        final TextView valueView;
        OrgNode selected;

        OrgPicker(TextView valueView) {
            this.valueView = valueView;
        }

        void select(OrgNode node) {
            selected = node;
            valueView.setText(buildOrgPath(node));
        }
    }

    private static class OrgNode {
        final String label;
        final String company;
        final String project;
        final String grid;
        final String team;
        final int level;

        OrgNode(String label, String company, String project, String grid, String team, int level) {
            this.label = label;
            this.company = company;
            this.project = project;
            this.grid = grid;
            this.team = team;
            this.level = level;
        }

        boolean isRoot() {
            return isEmpty(company) && isEmpty(project) && isEmpty(grid) && isEmpty(team);
        }

        String key() {
            if (isRoot()) {
                return "root";
            }
            return "root|" + safe(company) + "|" + safe(project) + "|" + safe(grid) + "|" + safe(team);
        }

        private static String safe(String value) {
            return value == null ? "" : value;
        }

        private static boolean isEmpty(String value) {
            return value == null || value.isEmpty();
        }
    }
}
