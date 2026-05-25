package com.app.myapplication.ui.call;

import android.text.TextUtils;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.call.AppVoiceMember;

import java.util.ArrayList;
import java.util.List;

public class VoiceRoomMemberAdapter extends RecyclerView.Adapter<VoiceRoomMemberAdapter.VH> {
    private final List<AppVoiceMember> members = new ArrayList<>();

    public void setMembers(List<AppVoiceMember> data) {
        members.clear();
        if (data != null) {
            members.addAll(data);
        }
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_voice_room_member, parent, false);
        return new VH(view);
    }

    @Override
    public void onBindViewHolder(@NonNull VH holder, int position) {
        holder.bind(members.get(position));
    }

    @Override
    public int getItemCount() {
        return members.size();
    }

    static class VH extends RecyclerView.ViewHolder {
        TextView tvAvatar;
        TextView tvName;
        TextView tvStatus;
        TextView tvRole;

        VH(@NonNull View itemView) {
            super(itemView);
            tvAvatar = itemView.findViewById(R.id.tv_avatar);
            tvName = itemView.findViewById(R.id.tv_name);
            tvStatus = itemView.findViewById(R.id.tv_status);
            tvRole = itemView.findViewById(R.id.tv_role);
        }

        void bind(AppVoiceMember member) {
            String name = TextUtils.isEmpty(member.name) ? member.userId : member.name;
            tvName.setText(name);
            tvAvatar.setText(TextUtils.isEmpty(name) ? "语" : name.substring(0, 1));
            tvRole.setText("host".equals(member.role) ? "发起人" : "成员");
            tvStatus.setText(statusText(member.status, member.muted));
        }

        private String statusText(String status, boolean muted) {
            if (muted) {
                return "已静音";
            }
            if ("joined".equals(status)) {
                return "通话中";
            }
            if ("ringing".equals(status) || "invited".equals(status)) {
                return "呼叫中";
            }
            if ("rejected".equals(status)) {
                return "已拒绝";
            }
            if ("left".equals(status)) {
                return "已离开";
            }
            return "等待中";
        }
    }
}
