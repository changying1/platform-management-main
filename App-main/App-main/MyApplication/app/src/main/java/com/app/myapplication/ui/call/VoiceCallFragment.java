package com.app.myapplication.ui.call;

import android.Manifest;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

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
import com.app.myapplication.data.local.SessionManager;
import com.app.myapplication.data.model.call.AppVoiceParticipant;
import com.app.myapplication.data.model.call.AppVoiceRoom;
import com.app.myapplication.data.model.call.AppVoiceRoomCreateRequest;

import java.util.ArrayList;
import java.util.HashSet;
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
    private Button btnSwitchIdentity;
    private Button btnStartCall;
    private ProgressBar progressBar;
    private RecyclerView rvContacts;

    private final List<Contact> allContacts = new ArrayList<>();
    private final List<Contact> contacts = new ArrayList<>();
    private final Set<String> selectedIds = new HashSet<>();
    private ContactAdapter adapter;
    private ActivityResultLauncher<String> audioPermissionLauncher;

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
        btnSwitchIdentity = view.findViewById(R.id.btn_switch_identity);
        btnStartCall = view.findViewById(R.id.btn_start_call);
        progressBar = view.findViewById(R.id.progress_bar);
        rvContacts = view.findViewById(R.id.rv_contacts);

        adapter = new ContactAdapter();
        rvContacts.setLayoutManager(new LinearLayoutManager(requireContext()));
        rvContacts.setAdapter(adapter);

        btnStartCall.setOnClickListener(v -> startCallWithPermission());
        btnSwitchIdentity.setOnClickListener(v -> showIdentityDialog());

        loadContacts();
        updateCurrentIdentity();
        updateSelectionState();
    }

    private void loadContacts() {
        progressBar.setVisibility(View.VISIBLE);
        AppVoiceCallApi api = ApiClient.get(requireContext()).create(AppVoiceCallApi.class);
        api.getPersonnel().enqueue(new Callback<List<Map<String, Object>>>() {
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
                        if (!TextUtils.isEmpty(id) && !TextUtils.isEmpty(name)) {
                            allContacts.add(new Contact(id, name, dept, role));
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
        allContacts.add(new Contact(id, name, dept, role));
    }

    private void applyContactFilter() {
        SessionManager session = new SessionManager(requireContext());
        String currentUserId = session.getUserId();
        contacts.clear();
        for (Contact contact : allContacts) {
            if (!TextUtils.equals(contact.id, currentUserId)) {
                contacts.add(contact);
            }
        }
        selectedIds.remove(currentUserId);
        adapter.notifyDataSetChanged();
    }

    private void showIdentityDialog() {
        if (allContacts.isEmpty()) {
            Toast.makeText(requireContext(), "暂无可选测试身份", Toast.LENGTH_SHORT).show();
            return;
        }

        String[] names = new String[allContacts.size()];
        for (int i = 0; i < allContacts.size(); i++) {
            Contact contact = allContacts.get(i);
            names[i] = contact.name + " (" + contact.id + ")";
        }

        new AlertDialog.Builder(requireContext())
                .setTitle("选择当前测试身份")
                .setItems(names, (dialog, which) -> {
                    Contact contact = allContacts.get(which);
                    new SessionManager(requireContext()).saveTestUser(contact.id, contact.name);
                    selectedIds.remove(contact.id);
                    updateCurrentIdentity();
                    applyContactFilter();
                    updateSelectionState();
                    if (requireActivity() instanceof GroupCallActivity) {
                        ((GroupCallActivity) requireActivity()).reconnectCallSocket();
                    }
                    Toast.makeText(requireContext(), "当前身份：" + contact.name, Toast.LENGTH_SHORT).show();
                })
                .show();
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
            Toast.makeText(requireContext(), "请先选择当前测试身份", Toast.LENGTH_SHORT).show();
            showIdentityDialog();
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

    private void setLoading(boolean loading) {
        progressBar.setVisibility(loading ? View.VISIBLE : View.GONE);
        btnStartCall.setEnabled(!loading);
        btnStartCall.setText(loading ? "正在创建..." : "发起语音通话");
    }

    private void updateSelectionState() {
        int count = selectedIds.size();
        tvSelectedCount.setText(String.format(Locale.getDefault(), "已选择 %d 人", count));
        tvSubtitle.setText(count == 0 ? "选择成员后发起实时语音房间" : "将邀请所选成员加入 Agora 语音房间");
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
            holder.bind(contacts.get(position));
        }

        @Override
        public int getItemCount() {
            return contacts.size();
        }

        class VH extends RecyclerView.ViewHolder {
            TextView tvName;
            TextView tvCompany;
            TextView tvProject;
            CheckBox cbSelected;

            VH(@NonNull View itemView) {
                super(itemView);
                tvName = itemView.findViewById(R.id.tv_name);
                tvCompany = itemView.findViewById(R.id.tv_company);
                tvProject = itemView.findViewById(R.id.tv_project);
                cbSelected = itemView.findViewById(R.id.cb_selected);
            }

            void bind(Contact contact) {
                tvName.setText(contact.name);
                tvCompany.setText(TextUtils.isEmpty(contact.dept) ? "未设置部门" : contact.dept);
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
        }
    }

    private static class Contact {
        final String id;
        final String name;
        final String dept;
        final String role;

        Contact(String id, String name, String dept, String role) {
            this.id = id;
            this.name = name;
            this.dept = dept;
            this.role = role;
        }
    }
}
