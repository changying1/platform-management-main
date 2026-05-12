package com.app.myapplication.ui.call;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;

import java.util.ArrayList;
import java.util.List;

public class VoiceCallFragment extends Fragment {

    private TextView tvContactName;
    private TextView tvCallStatus;
    private TextView tvCallDuration;
    private RecyclerView rvContacts;
    private LinearLayout btnSpeaker;
    private LinearLayout btnMute;
    private LinearLayout btnCall;
    private LinearLayout btnRecord;
    private LinearLayout btnMore;
    private ImageView ivCallIcon;
    private ImageView ivAvatar;
    private View vOnlineStatus;

    private boolean isCallActive = false;
    private boolean isMuted = false;
    private boolean isSpeakerOn = true;
    private boolean isRecording = false;
    private int callDuration = 0;
    private Handler timerHandler;
    private Runnable timerRunnable;

    private ContactAdapter contactAdapter;
    private List<Contact> contacts = new ArrayList<>();
    private Contact selectedContact = null;

    public static VoiceCallFragment newInstance() {
        return new VoiceCallFragment();
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_voice_call, container, false);
        initViews(view);
        initContacts();
        initListeners();
        return view;
    }

    private void initViews(View view) {
        tvContactName = view.findViewById(R.id.tv_contact_name);
        tvCallStatus = view.findViewById(R.id.tv_call_status);
        tvCallDuration = view.findViewById(R.id.tv_call_duration);
        rvContacts = view.findViewById(R.id.rv_contacts);
        btnSpeaker = view.findViewById(R.id.btn_speaker);
        btnMute = view.findViewById(R.id.btn_mute);
        btnCall = view.findViewById(R.id.btn_call);
        btnRecord = view.findViewById(R.id.btn_record);
        btnMore = view.findViewById(R.id.btn_more);
        ivCallIcon = view.findViewById(R.id.iv_call_icon);
        ivAvatar = view.findViewById(R.id.iv_avatar);
        vOnlineStatus = view.findViewById(R.id.v_online_status);

        rvContacts.setLayoutManager(new LinearLayoutManager(getContext()));
        contactAdapter = new ContactAdapter(this::onContactSelected);
        rvContacts.setAdapter(contactAdapter);

        timerHandler = new Handler(Looper.getMainLooper());
    }

    private void initContacts() {
        contacts.clear();
        contacts.add(new Contact("1", "张三", "在线", "中铁一局", "西安地铁8号线"));
        contacts.add(new Contact("2", "李四", "在线", "中铁一局", "西安地铁8号线"));
        contacts.add(new Contact("3", "王五", "忙碌", "中铁隧道局", "西安地铁10号线"));
        contacts.add(new Contact("4", "赵六", "在线", "中铁隧道局", "西安地铁10号线"));
        contacts.add(new Contact("5", "钱七", "离线", "中铁一局", "西安地铁8号线"));
        contactAdapter.setData(contacts);
    }

    private void initListeners() {
        btnSpeaker.setOnClickListener(v -> toggleSpeaker());
        btnMute.setOnClickListener(v -> toggleMute());
        btnCall.setOnClickListener(v -> toggleCall());
        btnRecord.setOnClickListener(v -> toggleRecording());
        btnMore.setOnClickListener(v -> showMoreOptions());
    }

    private void onContactSelected(Contact contact) {
        selectedContact = contact;
        tvContactName.setText(contact.name);
        tvCallStatus.setText(contact.status);
        
        if ("在线".equals(contact.status)) {
            vOnlineStatus.setBackgroundResource(R.drawable.circle_green);
        } else if ("忙碌".equals(contact.status)) {
            vOnlineStatus.setBackgroundResource(R.drawable.circle_yellow);
        } else {
            vOnlineStatus.setBackgroundResource(R.drawable.circle_gray);
        }
    }

    private void toggleSpeaker() {
        isSpeakerOn = !isSpeakerOn;
        btnSpeaker.setBackgroundResource(isSpeakerOn ? 
                R.drawable.circle_gray_background : R.drawable.circle_teal_background);
        Toast.makeText(getContext(), isSpeakerOn ? "扬声器已开启" : "扬声器已关闭", Toast.LENGTH_SHORT).show();
    }

    private void toggleMute() {
        isMuted = !isMuted;
        btnMute.setBackgroundResource(isMuted ? 
                R.drawable.circle_red_background : R.drawable.circle_gray_background);
        Toast.makeText(getContext(), isMuted ? "麦克风已静音" : "麦克风已开启", Toast.LENGTH_SHORT).show();
    }

    private void toggleCall() {
        if (!isCallActive) {
            if (selectedContact == null) {
                Toast.makeText(getContext(), "请先选择一个联系人", Toast.LENGTH_SHORT).show();
                return;
            }
            if (!"在线".equals(selectedContact.status)) {
                Toast.makeText(getContext(), "对方不在线，无法通话", Toast.LENGTH_SHORT).show();
                return;
            }
            startCall();
        } else {
            endCall();
        }
    }

    private void startCall() {
        isCallActive = true;
        callDuration = 0;
        
        btnCall.setBackgroundResource(R.drawable.circle_red_background);
        ivCallIcon.setImageResource(R.drawable.ic_phone_off);
        tvCallStatus.setText("通话中");
        tvCallDuration.setVisibility(View.VISIBLE);
        vOnlineStatus.setBackgroundResource(R.drawable.circle_green);
        
        startTimer();
        Toast.makeText(getContext(), "正在呼叫 " + selectedContact.name, Toast.LENGTH_SHORT).show();
    }

    private void endCall() {
        isCallActive = false;
        
        btnCall.setBackgroundResource(R.drawable.circle_green_background);
        ivCallIcon.setImageResource(R.drawable.ic_phone);
        tvCallStatus.setText(selectedContact != null ? selectedContact.status : "离线");
        tvCallDuration.setVisibility(View.GONE);
        
        stopTimer();
        Toast.makeText(getContext(), "通话结束", Toast.LENGTH_SHORT).show();
    }

    private void toggleRecording() {
        if (!isCallActive) {
            Toast.makeText(getContext(), "请先开始通话", Toast.LENGTH_SHORT).show();
            return;
        }
        
        isRecording = !isRecording;
        btnRecord.setBackgroundResource(isRecording ? 
                R.drawable.circle_red_background : R.drawable.circle_gray_background);
        Toast.makeText(getContext(), isRecording ? "录音已开始" : "录音已结束", Toast.LENGTH_SHORT).show();
    }

    private void showMoreOptions() {
        Toast.makeText(getContext(), "更多功能开发中...", Toast.LENGTH_SHORT).show();
    }

    private void startTimer() {
        stopTimer();
        timerRunnable = new Runnable() {
            @Override
            public void run() {
                callDuration++;
                updateDuration();
                timerHandler.postDelayed(this, 1000);
            }
        };
        timerHandler.post(timerRunnable);
    }

    private void stopTimer() {
        if (timerRunnable != null) {
            timerHandler.removeCallbacks(timerRunnable);
            timerRunnable = null;
        }
    }

    private void updateDuration() {
        int minutes = callDuration / 60;
        int seconds = callDuration % 60;
        tvCallDuration.setText(String.format("%02d:%02d", minutes, seconds));
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        stopTimer();
    }

    // 联系人数据类
    public static class Contact {
        String id;
        String name;
        String status;
        String company;
        String project;

        public Contact(String id, String name, String status, String company, String project) {
            this.id = id;
            this.name = name;
            this.status = status;
            this.company = company;
            this.project = project;
        }
    }

    // 联系人适配器
    private static class ContactAdapter extends RecyclerView.Adapter<ContactAdapter.VH> {
        private List<Contact> data = new ArrayList<>();
        private final OnContactSelectedListener listener;

        interface OnContactSelectedListener {
            void onSelected(Contact contact);
        }

        ContactAdapter(OnContactSelectedListener listener) {
            this.listener = listener;
        }

        void setData(List<Contact> data) {
            this.data = data;
            notifyDataSetChanged();
        }

        @NonNull
        @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View view = LayoutInflater.from(parent.getContext())
                    .inflate(R.layout.item_contact, parent, false);
            return new VH(view);
        }

        @Override
        public void onBindViewHolder(@NonNull VH holder, int position) {
            Contact item = data.get(position);
            holder.tvName.setText(item.name);
            holder.tvCompany.setText(item.company);
            holder.tvProject.setText(item.project);
            
            switch (item.status) {
                case "在线":
                    holder.vStatus.setBackgroundResource(R.drawable.circle_green);
                    break;
                case "忙碌":
                    holder.vStatus.setBackgroundResource(R.drawable.circle_yellow);
                    break;
                default:
                    holder.vStatus.setBackgroundResource(R.drawable.circle_gray);
            }
            
            holder.itemView.setOnClickListener(v -> listener.onSelected(item));
        }

        @Override
        public int getItemCount() {
            return data.size();
        }

        static class VH extends RecyclerView.ViewHolder {
            TextView tvName, tvCompany, tvProject;
            View vStatus;

            VH(View itemView) {
                super(itemView);
                tvName = itemView.findViewById(R.id.tv_name);
                tvCompany = itemView.findViewById(R.id.tv_company);
                tvProject = itemView.findViewById(R.id.tv_project);
                vStatus = itemView.findViewById(R.id.v_status);
            }
        }
    }
}